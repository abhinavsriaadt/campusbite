"""RBAC matrix (SPEC §3, §12): every endpoint × every role.

- Every endpoint in the OpenAPI schema must be listed here, so a new route can't ship unchecked.
- Anonymous callers get 401 on every protected endpoint.
- Every role that isn't allowed gets 403, even for a resource it can otherwise see.
- A user of the right role gets 404 for another user's resource (no IDOR, no id probing).
"""

from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.main import app
from app.models import Order
from app.services.reminder_service import generate_reminders

CUST, OWNER, RIDER = "customer", "restaurant_owner", "delivery_partner"
ANY = {CUST, OWNER, RIDER}
PUBLIC = "public"

# (method, path) -> roles allowed (or PUBLIC). Bodies are minimal but valid where the role check
# happens inside the handler (after body validation).
MATRIX = {
    ("POST", "/api/auth/register"): PUBLIC,
    ("POST", "/api/auth/login"): PUBLIC,
    ("GET", "/api/auth/me"): ANY,
    ("PATCH", "/api/auth/me"): ANY,
    ("GET", "/api/categories"): PUBLIC,
    ("GET", "/api/restaurants"): PUBLIC,
    ("GET", "/api/restaurants/cuisines"): PUBLIC,
    ("GET", "/api/restaurants/{restaurant_id}"): PUBLIC,
    ("GET", "/api/restaurants/{restaurant_id}/menu"): PUBLIC,
    ("GET", "/api/dishes"): PUBLIC,
    ("GET", "/api/restaurants/{restaurant_id}/reviews"): PUBLIC,
    ("POST", "/api/orders/quote"): {CUST},
    ("POST", "/api/orders"): {CUST},
    ("GET", "/api/orders"): ANY,
    ("GET", "/api/orders/{order_id}"): ANY,
    ("GET", "/api/orders/{order_id}/payments"): {CUST, OWNER},
    ("PATCH", "/api/orders/{order_id}/status"): {OWNER, RIDER},
    ("POST", "/api/orders/{order_id}/cancel"): {CUST, OWNER},
    ("POST", "/api/orders/{order_id}/assign"): {OWNER},
    ("POST", "/api/orders/{order_id}/review"): {CUST},
    ("POST", "/api/orders/{order_id}/return"): {CUST},
    ("GET", "/api/returns"): {CUST, OWNER},
    ("POST", "/api/returns/{return_id}/approve"): {OWNER},
    ("POST", "/api/returns/{return_id}/reject"): {OWNER},
    ("GET", "/api/owner/restaurant"): {OWNER},
    ("PATCH", "/api/owner/restaurant"): {OWNER},
    ("GET", "/api/owner/menu-items"): {OWNER},
    ("POST", "/api/owner/menu-items"): {OWNER},
    ("GET", "/api/owner/menu-items/{item_id}"): {OWNER},
    ("PATCH", "/api/owner/menu-items/{item_id}"): {OWNER},
    ("DELETE", "/api/owner/menu-items/{item_id}"): {OWNER},
    ("PATCH", "/api/owner/menu-items/{item_id}/availability"): {OWNER},
    ("GET", "/api/owner/delivery-partners"): {OWNER},
    ("GET", "/api/owner/stats"): {OWNER},
    ("GET", "/api/owner/reminders"): {OWNER},
    ("POST", "/api/owner/reminders/{reminder_id}/dismiss"): {OWNER},
    ("GET", "/api/delivery/stats"): {RIDER},
    ("GET", "/api/ai/status"): {CUST},
    ("POST", "/api/ai/insights"): {CUST},
    ("GET", "/health"): PUBLIC,
}

BODIES = {
    ("PATCH", "/api/orders/{order_id}/status"): {"status": "OUT_FOR_DELIVERY"},
    ("POST", "/api/orders/{order_id}/assign"): {"delivery_partner_id": 0},
    ("POST", "/api/orders/{order_id}/review"): {"rating": 5},
    ("POST", "/api/orders/{order_id}/return"): {"reason": "Food arrived cold and spilled"},
    ("POST", "/api/ai/insights"): {"question": "Summarize my last five orders"},
}


def test_matrix_covers_every_endpoint():
    schema_ops = {(m.upper(), p) for p, ops in app.openapi()["paths"].items() for m in ops}
    assert schema_ops == set(MATRIX), {"missing": schema_ops - set(MATRIX), "stale": set(MATRIX) - schema_ops}


@pytest.fixture
def ids(world, client):
    """Resources every role could plausibly touch: an order assigned to `rider`, a return, a reminder."""
    oid = world.place()["id"]
    world.advance_to(oid, "ASSIGNED")
    returned = world.place()["id"]
    world.advance_to(returned, "DELIVERED")
    world.cust.post(f"/api/orders/{returned}/return", {"reason": "Food arrived cold and spilled"})
    rid = world.owner.get("/api/returns").json()["items"][0]["id"]
    stale = world.place()["id"]
    with SessionLocal() as s:
        o = s.get(Order, stale)
        o.status_updated_at -= timedelta(minutes=30)
        s.commit()
        generate_reminders(s, threshold_minutes=15)
    reminder = world.owner.get("/api/owner/reminders").json()["items"][0]["id"]
    return {"order_id": oid, "return_id": rid, "item_id": world.d1["id"], "reminder_id": reminder,
            "restaurant_id": world.rest_id}


def _call(client, actor, method, path, ids):
    url = path.format(**ids)
    body = BODIES.get((method, path), {})
    headers = actor.h if actor else {}
    if method in ("GET", "DELETE"):
        return client.request(method, url, headers=headers)
    return client.request(method, url, headers=headers, json=body)


PROTECTED = sorted(k for k, v in MATRIX.items() if v != PUBLIC)


@pytest.mark.parametrize("method,path", PROTECTED)
def test_anonymous_gets_401(client, ids, method, path):
    r = _call(client, None, method, path, ids)
    assert r.status_code == 401, (method, path, r.status_code, r.text)


@pytest.mark.parametrize("method,path", [k for k in PROTECTED if MATRIX[k] != ANY])
def test_wrong_role_gets_403(client, world, ids, method, path):
    actors = {CUST: world.cust, OWNER: world.owner, RIDER: world.rider}
    for role, actor in actors.items():
        if role in MATRIX[(method, path)]:
            continue
        r = _call(client, actor, method, path, ids)
        assert r.status_code == 403, (role, method, path, r.status_code, r.text)


def test_public_endpoints_need_no_token(client, world, ids):
    for (method, path), roles in MATRIX.items():
        if roles == PUBLIC and method == "GET":
            r = _call(client, None, method, path, ids)
            assert r.status_code == 200, (path, r.text)


def test_other_users_resources_are_404(world, ids):
    """Same role, different user: indistinguishable from a resource that doesn't exist."""
    oid, rid, item, reminder = ids["order_id"], ids["return_id"], ids["item_id"], ids["reminder_id"]
    checks = [
        (world.cust2, "GET", f"/api/orders/{oid}", None),
        (world.cust2, "GET", f"/api/orders/{oid}/payments", None),
        (world.cust2, "POST", f"/api/orders/{oid}/cancel", {}),
        (world.cust2, "POST", f"/api/orders/{oid}/review", {"rating": 5}),
        (world.cust2, "POST", f"/api/orders/{oid}/return", {"reason": "Food arrived cold and spilled"}),
        (world.owner2, "GET", f"/api/orders/{oid}", None),
        (world.owner2, "GET", f"/api/orders/{oid}/payments", None),
        (world.owner2, "PATCH", f"/api/orders/{oid}/status", {"status": "ACCEPTED"}),
        (world.owner2, "POST", f"/api/orders/{oid}/cancel", {}),
        (world.owner2, "POST", f"/api/orders/{oid}/assign", {"delivery_partner_id": world.rider2.user["id"]}),
        (world.owner2, "POST", f"/api/returns/{rid}/approve", {}),
        (world.owner2, "POST", f"/api/returns/{rid}/reject", {}),
        (world.owner2, "GET", f"/api/owner/menu-items/{item}", None),
        (world.owner2, "PATCH", f"/api/owner/menu-items/{item}", {"price": 1}),
        (world.owner2, "PATCH", f"/api/owner/menu-items/{item}/availability", {"is_available": False}),
        (world.owner2, "DELETE", f"/api/owner/menu-items/{item}", None),
        (world.owner2, "POST", f"/api/owner/reminders/{reminder}/dismiss", {}),
        (world.rider2, "GET", f"/api/orders/{oid}", None),
        (world.rider2, "PATCH", f"/api/orders/{oid}/status", {"status": "OUT_FOR_DELIVERY"}),
    ]
    for actor, method, url, body in checks:
        r = actor.client.request(method, url, headers=actor.h, **({"json": body} if body is not None else {}))
        assert r.status_code == 404, (actor.user["email"], method, url, r.status_code, r.text)
    # Lists are scoped too.
    assert world.cust2.get("/api/orders").json()["total"] == 0
    assert world.cust2.get("/api/returns").json()["total"] == 0
    assert world.owner2.get("/api/orders").json()["total"] == 0
    assert world.owner2.get("/api/returns").json()["total"] == 0
    assert world.owner2.get("/api/owner/reminders").json()["total"] == 0
    assert world.rider2.get("/api/orders").json()["total"] == 0


@pytest.mark.parametrize("path", [
    "/api/restaurants", "/api/dishes", "/api/restaurants/{restaurant_id}/reviews", "/api/orders", "/api/returns",
    "/api/owner/menu-items", "/api/owner/reminders",
])
def test_lists_are_paginated(world, ids, path):
    actor = world.owner if path.startswith(("/api/owner", "/api/returns")) else world.cust
    r = actor.get(path.format(**ids), params={"page": 1, "page_size": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"items", "total", "page", "page_size", "pages"}
    assert body["page"] == 1 and body["page_size"] == 1 and len(body["items"]) <= 1
    assert body["pages"] == max(1, body["total"])
    assert actor.get(path.format(**ids), params={"page_size": 101}).status_code == 422
