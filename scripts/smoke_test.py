#!/usr/bin/env python3
"""End-to-end smoke test against a running CampusBite API (e.g. `docker compose up`).

Drives the whole order lifecycle with fresh accounts for all three roles:
register → menu → order (mock payment) → accept → prepare → ready → assign → out → deliver
→ review → return → approve (refund), plus RBAC and rule checks along the way.

Usage:  python scripts/smoke_test.py            (API at http://localhost:8000/api)
        SMOKE_API_URL=http://host:8000/api python scripts/smoke_test.py
Standard library only. Exit code 0 when every step passes.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("SMOKE_API_URL", "http://localhost:8000/api").rstrip("/")
PASSWORD = "Smoke2026x"
STAMP = str(int(time.time()))
results: list[tuple[str, bool, str]] = []


def call(method, path, body=None, token=None):
    """Return (status, json_body, headers). Never raises on HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None), dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            payload = raw.decode(errors="replace")
        return e.code, payload, dict(e.headers)


def step(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not ok else ""))
    return ok


def expect(name, status, want, body=None):
    return step(name, status == want, f"got {status}, want {want}: {str(body)[:160]}")


def register(role, extra=None):
    email = f"smoke.{role.split('_')[0]}.{STAMP}@example.com"
    body = {"name": f"Smoke {role.replace('_', ' ').title()}", "email": email, "password": PASSWORD,
            "role": role, "phone": "9876500000", **(extra or {})}
    status, data, _ = call("POST", "/auth/register", body)
    expect(f"register {role}", status, 201, data)
    return data["access_token"] if status == 201 else None, (data or {}).get("user", {})


def main() -> int:
    print(f"CampusBite smoke test → {API}\n")
    status, data, headers = call("GET", "/restaurants?page_size=1")
    if not step("API reachable and lists restaurants", status == 200, f"status {status}"):
        print("\nIs the backend running?  docker compose up -d")
        return 1
    step("middleware sets X-Process-Time", "X-Process-Time" in headers or "x-process-time" in headers)

    cust, cust_user = register("customer", {"address": "Room 101, Hostel A, Lucknow"})
    owner, owner_user = register("restaurant_owner", {"restaurant": {"name": f"Smoke Kitchen {STAMP}", "cuisine": "North Indian"}})
    rider, rider_user = register("delivery_partner")
    if not (cust and owner and rider):
        return report()

    status, data, _ = call("POST", "/auth/login", {"email": cust_user["email"], "password": PASSWORD})
    expect("customer logs in (JWT)", status, 200, data)
    status, data, _ = call("POST", "/auth/login", {"email": cust_user["email"], "password": "wrong-pass-1"})
    expect("wrong password → 401", status, 401, data)
    status, data, _ = call("GET", "/auth/me", token=cust)
    step("GET /auth/me returns the customer", status == 200 and data["role"] == "customer", str(data))

    status, rest, _ = call("GET", "/owner/restaurant", token=owner)
    expect("owner sees own restaurant", status, 200, rest)
    status, dish, _ = call("POST", "/owner/menu-items", {"name": "Smoke Paneer Tikka", "price": 220, "category": "Starters"}, owner)
    expect("owner adds a dish", status, 201, dish)
    status, side, _ = call("POST", "/owner/menu-items", {"name": "Smoke Butter Naan", "price": 45.5, "category": "Breads"}, owner)
    expect("owner adds a second dish", status, 201, side)
    status, data, _ = call("PATCH", f"/owner/menu-items/{side['id']}/availability", {"is_available": False}, owner)
    step("owner marks a dish unavailable", status == 200 and data["is_available"] is False, str(data))
    status, data, _ = call("PATCH", f"/owner/menu-items/{side['id']}/availability", {"is_available": True}, owner)
    step("owner marks it available again", status == 200 and data["is_available"] is True, str(data))

    status, menu, _ = call("GET", f"/restaurants/{rest['id']}/menu?search=paneer&max_price=300")
    step("customer searches the menu by name and price", status == 200 and menu["total"] == 1, str(menu)[:160])
    status, data, _ = call("POST", "/owner/menu-items", {"name": "Hack", "price": 1}, cust)
    expect("customer cannot add dishes → 403", status, 403, data)

    items = [{"menu_item_id": dish["id"], "quantity": 2}, {"menu_item_id": side["id"], "quantity": 1}]
    status, order, _ = call("POST", "/orders", {"restaurant_id": rest["id"], "items": items,
                                                 "delivery_address": "Room 101, Hostel A, Lucknow", "payment_method": "upi"}, cust)
    if not expect("customer places an order", status, 201, order):
        return report()
    oid = order["id"]
    step("payment_status is mock_paid", order["payment_status"] == "mock_paid", order["payment_status"])
    step("payment ledger has a PAYMENT entry",
         [p["entry_type"] for p in order["payments"]] == ["PAYMENT"] and order["payments"][0]["amount"] == order["total_amount"])
    status, data, _ = call("GET", f"/orders/{oid}", token=rider)
    expect("unassigned rider cannot see the order → 404", status, 404, data)

    def move(token, action, body, want, label):
        method = "PATCH" if action == "status" else "POST"
        status, data, _ = call(method, f"/orders/{oid}/{action}", body, token)
        ok = status == 200 and data.get("status") == want
        return step(label, ok, f"{status} {str(data)[:160]}")

    status, data, _ = call("PATCH", f"/orders/{oid}/status", {"status": "READY"}, owner)
    expect("skipping a step (PLACED → READY) → 400", status, 400, data)
    move(owner, "status", {"status": "ACCEPTED"}, "ACCEPTED", "owner accepts")
    status, data, _ = call("POST", f"/orders/{oid}/cancel", {}, cust)
    expect("customer cannot cancel after PLACED → 400", status, 400, data)
    move(owner, "status", {"status": "PREPARING"}, "PREPARING", "owner starts preparing")
    status, data, _ = call("POST", f"/orders/{oid}/assign", {"delivery_partner_id": rider_user["id"]}, owner)
    expect("assigning before READY → 400", status, 400, data)
    move(owner, "status", {"status": "READY"}, "READY", "owner marks ready")
    move(owner, "assign", {"delivery_partner_id": rider_user["id"]}, "ASSIGNED", "owner assigns the rider")
    status, data, _ = call("GET", f"/orders/{oid}", token=rider)
    step("rider sees customer delivery details",
         status == 200 and data["delivery_address"] and data["customer"]["name"], str(data)[:160])
    move(rider, "status", {"status": "OUT_FOR_DELIVERY"}, "OUT_FOR_DELIVERY", "rider picks up (out for delivery)")
    move(rider, "status", {"status": "DELIVERED"}, "DELIVERED", "rider delivers")
    status, data, _ = call("GET", "/orders?scope=history", token=rider)
    step("order is in the rider's delivery history", status == 200 and any(o["id"] == oid for o in data["items"]))

    status, data, _ = call("POST", f"/orders/{oid}/cancel", {}, cust)
    expect("delivered order cannot be cancelled → 400", status, 400, data)
    status, data, _ = call("POST", f"/orders/{oid}/review", {"rating": 5, "comment": "Smoke test: great food"}, cust)
    expect("customer reviews the delivered order", status, 201, data)
    status, data, _ = call("POST", f"/orders/{oid}/review", {"rating": 4}, cust)
    expect("second review → 409", status, 409, data)
    status, data, _ = call("POST", f"/orders/{oid}/return", {"reason": ""}, cust)
    expect("return without a reason → 422", status, 422, data)
    status, data, _ = call("POST", f"/orders/{oid}/return", {"reason": "Smoke test: one dish was missing"}, cust)
    expect("customer requests a return", status, 201, data)
    status, data, _ = call("POST", f"/orders/{oid}/return", {"reason": "Smoke test: asking a second time"}, cust)
    expect("second return request → 409", status, 409, data)

    status, returns, _ = call("GET", "/returns?status=pending", token=owner)
    rr = next((r for r in (returns or {}).get("items", []) if r["order_id"] == oid), None)
    step("owner sees the pending return", status == 200 and rr is not None)
    if rr:
        status, data, _ = call("POST", f"/returns/{rr['id']}/approve", {"note": "Smoke test refund"}, owner)
        step("owner approves the return → refunded",
             status == 200 and data["payment_status"] == "refunded" and data["order_status"] == "REFUNDED", str(data)[:160])
    status, data, _ = call("GET", f"/orders/{oid}", token=cust)
    step("ledger has PAYMENT + REFUND", [p["entry_type"] for p in data["payments"]] == ["PAYMENT", "REFUND"])

    status, stats, _ = call("GET", "/owner/stats", token=owner)
    step("owner stats reflect the order", status == 200 and stats["total_orders"] == 1 and stats["refunded_orders"] == 1, str(stats)[:160])
    status, data, _ = call("GET", "/owner/stats", token=cust)
    expect("customer cannot read owner stats → 403", status, 403, data)
    status, data, _ = call("GET", "/orders", token=None)
    expect("no token → 401", status, 401, data)
    return report()


def report() -> int:
    passed = sum(ok for _, ok, _ in results)
    print(f"\n{passed}/{len(results)} steps passed" + ("" if passed == len(results) else " — FAILED"))
    return 0 if results and passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
