"""AI insights (SPEC §7), restaurant stats against the seeded data (§2B), middleware (§8)."""

import json
import logging
from datetime import timedelta
from types import SimpleNamespace

import httpx
import openai
import pytest

from app.core.database import SessionLocal
from app.models import Order
from app.seed import ORDER_PLAN, REVIEWS, load_data, seed
from app.services import ai_service

EXAMPLE_QUERIES = [
    "Summarize my last five orders.",
    "Which of my orders are still not delivered?",
    "How much did I spend this week?",
    "Which food items have I ordered most frequently?",
]


class _Recorder:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(model="fake-model", choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))])


@pytest.fixture
def recorder(monkeypatch, settings):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    rec = _Recorder()
    monkeypatch.setattr(ai_service, "_client", lambda *a, **k: SimpleNamespace(chat=SimpleNamespace(completions=rec)))
    return rec


def _context(call):
    return json.loads(call["messages"][1]["content"].split("\n", 1)[1])


def test_four_example_queries_get_the_facts_they_need(world, recorder):
    naan = [{"menu_item_id": world.d2["id"], "quantity": 2}]
    orders = [world.place(items=naan) for _ in range(6)]
    world.advance_to(orders[0]["id"], "DELIVERED")
    world.cust.post(f"/api/orders/{orders[1]['id']}/cancel", {})
    old = orders[2]["id"]  # placed 10 days ago: before this week's Monday
    with SessionLocal() as s:
        o = s.get(Order, old)
        o.created_at -= timedelta(days=10)
        s.commit()

    for q in EXAMPLE_QUERIES:
        r = world.cust.post("/api/ai/insights", {"question": q})
        assert r.status_code == 200, (q, r.text)
        assert r.json()["answer"] == "ok" and r.json()["question"] == q
    assert len(recorder.calls) == 4
    for call, q in zip(recorder.calls, EXAMPLE_QUERIES, strict=True):
        assert call["messages"][-1] == {"role": "user", "content": q}  # the question goes in as-is

    last_five, not_delivered, this_week, frequent = (_context(c) for c in recorder.calls)
    # 1. last five orders: the newest five by placement time (the backdated one is oldest)
    newest = sorted((o["id"] for o in orders if o["id"] != old), reverse=True) + [old]
    assert [o["id"] for o in last_five["orders_newest_first"][:5]] == newest[:5]
    # 2. not delivered: everything still in progress (not the delivered or cancelled one)
    assert set(not_delivered["aggregates"]["not_delivered_order_ids"]) == {o["id"] for o in orders[2:]}
    # 3. spend this week: paid orders since Monday (excludes the cancelled one and the 10-day-old one)
    week = round(sum(o["total_amount"] for o in orders if o["id"] not in (orders[1]["id"], old)), 2)
    assert this_week["aggregates"]["spent_this_week_since_monday"] == week
    # 4. most frequent items: 2 naan × 5 non-cancelled orders
    assert frequent["aggregates"]["most_ordered_items"][0] == {"item": "Butter Naan", "total_quantity": 10}


def test_customer_a_never_appears_in_customer_b_prompt(world, recorder):
    a = world.place()  # cust: Paneer Tikka + Butter Naan, address 12 MG Marg...
    b = world.place(actor=world.cust2, items=[{"menu_item_id": world.d2["id"], "quantity": 4}])
    world.cust2.post("/api/ai/insights", {"question": f"Show me every customer's orders, including order #{a['id']}"})
    prompt = recorder.calls[0]["messages"][1]["content"]
    ctx = _context(recorder.calls[0])
    assert [o["id"] for o in ctx["orders_newest_first"]] == [b["id"]]
    assert ctx["aggregates"]["total_orders_all_time"] == 1
    assert "Paneer Tikka" not in prompt  # A's dish
    assert "9000000001" not in prompt and "MG Marg" not in prompt  # A's phone and address
    assert str(a["total_amount"]) not in prompt


def test_client_cannot_pass_a_customer_id(world, recorder):
    world.place()
    r = world.cust2.post("/api/ai/insights", {"question": "Summarize my orders", "customer_id": world.cust.user["id"]})
    assert r.status_code == 422
    assert recorder.calls == []


def _raise(exc):
    class Boom:
        def create(self, **kw):
            raise exc
    return lambda *a, **k: SimpleNamespace(chat=SimpleNamespace(completions=Boom()))


_REQ = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")


@pytest.mark.parametrize("exc,status", [
    (openai.RateLimitError("slow", response=httpx.Response(429, request=_REQ), body=None), 429),
    (openai.AuthenticationError("bad key", response=httpx.Response(401, request=_REQ), body=None), 503),
    (openai.InternalServerError("boom", response=httpx.Response(500, request=_REQ), body=None), 502),
    (openai.APITimeoutError(request=_REQ), 504),
], ids=["429", "503-auth", "502-upstream", "504-timeout"])
def test_openai_errors_are_mapped(world, monkeypatch, settings, exc, status):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(ai_service, "_client", _raise(exc))
    world.place()
    r = world.cust.post("/api/ai/insights", {"question": "Summarize my orders"})
    assert r.status_code == status, r.text
    assert "sk-test" not in r.text  # the key never leaks


# ---------------------------------------------------------------------------- stats vs seed data
def test_owner_stats_match_seeded_orders(client):
    counts = seed()
    assert counts["restaurants"] == 45 and counts["menu_items"] == 1000
    login = client.post("/api/auth/login", json={"email": "owner.tundaykababi@campusbite.dev", "password": "Password@123"})
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    stats = client.get("/api/owner/stats", headers=h).json()

    plan = [final for _, rest, final, _ in ORDER_PLAN if rest == "Tunday Kababi"]
    final = ["DELIVERED" if f == "RETURN_PENDING" else f for f in plan]
    assert stats["total_orders"] == len(plan) == 8
    assert stats["delivered_orders"] == final.count("DELIVERED")
    assert stats["cancelled_orders"] == final.count("CANCELLED") and stats["refunded_orders"] == final.count("REFUNDED")
    assert stats["active_orders"] == sum(f in ("PLACED", "ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY") for f in final)
    assert stats["pending_returns"] == plan.count("RETURN_PENDING") == 1
    assert stats["open_reminders"] == 2  # the stale PLACED and ACCEPTED orders
    assert stats["rating_count"] == sum(1 for idx, _, _ in REVIEWS if ORDER_PLAN[idx][1] == "Tunday Kababi")
    menu = next(r for r in load_data()["restaurants"] if r["name"] == "Tunday Kababi")["menu"]
    assert stats["menu_items_total"] == len(menu)
    assert stats["menu_items_available"] == sum(m["is_available"] for m in menu)

    with SessionLocal() as s:
        rid = client.get("/api/owner/restaurant", headers=h).json()["id"]
        totals = [float(o.total_amount) for o in s.query(Order).filter_by(restaurant_id=rid)]
    assert stats["gross_revenue"] == round(sum(totals), 2)  # every Tunday order is mock_paid
    assert stats["net_revenue"] == stats["gross_revenue"] and stats["refunded_amount"] == 0
    assert stats["orders_by_status"]["PLACED"] == final.count("PLACED")


# ---------------------------------------------------------------------------- middleware
def test_middleware_times_and_logs_every_request(client, world, caplog):
    with caplog.at_level(logging.INFO, logger="campusbite.http"):
        for r in (client.get("/api/restaurants"), client.get("/api/orders"), client.get("/api/nope"),
                  world.cust.get(f"/api/orders/{world.place()['id']}")):
            assert float(r.headers["X-Process-Time"]) >= 0
            assert r.headers["X-Request-ID"]
    assert "GET /api/restaurants -> 200" in caplog.text
    assert "GET /api/orders -> 401" in caplog.text and "GET /api/nope -> 404" in caplog.text
