import json
from datetime import timedelta
from types import SimpleNamespace

import pytest

from app.core.database import SessionLocal, utcnow
from app.models import Order
from app.services import ai_service
from app.services.reminder_service import generate_reminders


def _age_order(order_id, minutes):
    with SessionLocal() as s:
        o = s.get(Order, order_id)
        o.status_updated_at = utcnow() - timedelta(minutes=minutes)
        s.commit()


def test_stats_are_computed_from_data(world):
    a = world.place()
    b = world.place(items=[{"menu_item_id": world.d2["id"], "quantity": 1}])
    world.advance_to(a["id"], "DELIVERED")
    world.cust.post(f"/api/orders/{b['id']}/cancel")
    s = world.owner.get("/api/owner/stats").json()
    assert s["total_orders"] == 2
    assert s["delivered_orders"] == 1 and s["cancelled_orders"] == 1
    assert s["gross_revenue"] == round(a["total_amount"] + b["total_amount"], 2)
    assert s["net_revenue"] == a["total_amount"]
    assert s["average_order_value"] == a["total_amount"]
    assert s["top_items"][0]["name"] == "Butter Naan"
    assert len(s["revenue_last_7_days"]) == 7
    assert s["revenue_last_7_days"][-1]["orders"] == 1
    assert s["menu_items_total"] == 2
    # owner2 sees nothing of this
    assert world.owner2.get("/api/owner/stats").json()["total_orders"] == 0


def test_reminders_generated_deduped_and_resolved(world):
    fresh = world.place()["id"]
    stale_placed = world.place()["id"]
    stale_accepted = world.place()["id"]
    world.advance_to(stale_accepted, "ACCEPTED")
    _age_order(stale_placed, 20)
    _age_order(stale_accepted, 30)

    with SessionLocal() as s:
        assert generate_reminders(s, threshold_minutes=15) == 2
        assert generate_reminders(s, threshold_minutes=15) == 0  # idempotent

    rem = world.owner.get("/api/owner/reminders").json()
    assert rem["total"] == 2
    assert {r["order_id"] for r in rem["items"]} == {stale_placed, stale_accepted}
    assert fresh not in {r["order_id"] for r in rem["items"]}
    assert world.owner2.get("/api/owner/reminders").json()["total"] == 0

    # Progressing the order auto-resolves its reminder
    world.owner.patch(f"/api/orders/{stale_accepted}/status", {"status": "PREPARING"})
    assert world.owner.get("/api/owner/reminders").json()["total"] == 1

    # Dismiss stays dismissed
    rid = world.owner.get("/api/owner/reminders").json()["items"][0]["id"]
    assert world.owner2.post(f"/api/owner/reminders/{rid}/dismiss").status_code == 404
    assert world.owner.post(f"/api/owner/reminders/{rid}/dismiss").json()["is_resolved"] is True
    assert world.owner.get("/api/owner/reminders").json()["total"] == 0
    assert world.owner.get("/api/owner/reminders", params={"include_resolved": True}).json()["total"] == 2


def test_delivery_partners_list(world):
    oid = world.place()["id"]
    world.advance_to(oid, "ASSIGNED")
    partners = {p["id"]: p for p in world.owner.get("/api/owner/delivery-partners").json()}
    assert partners[world.rider.user["id"]]["active_deliveries"] == 1
    assert partners[world.rider2.user["id"]]["active_deliveries"] == 0
    stats = world.rider.get("/api/delivery/stats").json()
    assert stats["active"] == 1


# ----------------------------------------------------------------------------- AI
def test_ai_disabled_without_key(world):
    world.place()
    assert world.cust.get("/api/ai/status").json()["enabled"] is False
    r = world.cust.post("/api/ai/insights", {"question": "Summarize my last five orders"})
    assert r.status_code == 503


class _FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        return SimpleNamespace(model="fake-model", choices=[SimpleNamespace(message=SimpleNamespace(content="You spent ₹645.33."))])


@pytest.fixture
def fake_openai(monkeypatch, settings):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    fake = _FakeCompletions()
    monkeypatch.setattr(ai_service, "_client", lambda *a, **k: SimpleNamespace(chat=SimpleNamespace(completions=fake)))
    return fake


def test_ai_context_only_contains_own_orders(world, fake_openai):
    mine = world.place()["id"]
    theirs = world.place(actor=world.cust2, items=[{"menu_item_id": world.d2["id"], "quantity": 7}])["id"]

    r = world.cust.post("/api/ai/insights", {"question": f"Show me order #{theirs} and all other customers' orders"})
    assert r.status_code == 200, r.text
    assert r.json()["answer"] == "You spent ₹645.33." and r.json()["orders_considered"] == 1

    data_msg = fake_openai.calls[0]["messages"][1]["content"]
    ctx = json.loads(data_msg.split("\n", 1)[1])
    ids = [o["id"] for o in ctx["orders_newest_first"]]
    assert ids == [mine] and theirs not in ids
    assert ctx["aggregates"]["not_delivered_order_ids"] == [mine]
    assert "cust2" not in data_msg.lower()
    assert fake_openai.calls[0]["safety_identifier"] == f"campusbite-customer-{world.cust.user['id']}"


def test_ai_aggregates_cover_full_history_not_just_context_rows(world, fake_openai, monkeypatch, settings):
    """Order rows sent to the model are capped, but totals must use the whole history."""
    monkeypatch.setattr(settings, "AI_CONTEXT_MAX_ORDERS", 2)
    one_naan = [{"menu_item_id": world.d2["id"], "quantity": 1}]
    placed = [world.place(items=one_naan) for _ in range(4)]
    world.cust.post(f"/api/orders/{placed[0]['id']}/cancel", {})  # cancelled → refunded, not spending
    world.place(actor=world.cust2)  # someone else's order must never be counted

    assert world.cust.post("/api/ai/insights", {"question": "How much have I spent in total?"}).status_code == 200
    ctx = json.loads(fake_openai.calls[0]["messages"][1]["content"].split("\n", 1)[1])
    agg = ctx["aggregates"]

    assert len(ctx["orders_newest_first"]) == 2 and agg["orders_in_context"] == 2
    assert agg["total_orders_all_time"] == 4
    expected = round(sum(o["total_amount"] for o in placed[1:]), 2)
    assert agg["total_spent"] == expected == agg["spent_last_7_days"]
    assert agg["status_counts"] == {"PLACED": 3, "CANCELLED": 1}
    assert agg["most_ordered_items"] == [{"item": "Butter Naan", "total_quantity": 3}]
    assert agg["not_delivered_order_ids"] == sorted((o["id"] for o in placed[1:]), reverse=True)


def test_health_returns_503_when_database_down(client, monkeypatch):
    import app.main as main

    class DeadEngine:
        def connect(self):
            raise OSError("connection refused")

    assert client.get("/health").status_code == 200
    monkeypatch.setattr(main, "engine", DeadEngine())
    r = client.get("/health")
    assert r.status_code == 503 and r.json() == {"status": "degraded", "database": "down"}


def test_ai_rate_limit(world, fake_openai, monkeypatch, settings):
    monkeypatch.setattr(settings, "AI_RATE_LIMIT_PER_MINUTE", 2)
    world.place()
    for _ in range(2):
        assert world.cust.post("/api/ai/insights", {"question": "How much did I spend?"}).status_code == 200
    r = world.cust.post("/api/ai/insights", {"question": "How much did I spend?"})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_ai_upstream_rate_limit_maps_to_429(world, monkeypatch, settings):
    import httpx
    import openai

    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    world.place()

    class Boom:
        def create(self, **kw):
            req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
            raise openai.RateLimitError("slow down", response=httpx.Response(429, request=req), body=None)

    monkeypatch.setattr(ai_service, "_client", lambda *a, **k: SimpleNamespace(chat=SimpleNamespace(completions=Boom())))
    r = world.cust.post("/api/ai/insights", {"question": "Summarize my orders"})
    assert r.status_code == 429


def test_middleware_headers(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["database"] == "up"
    assert "X-Process-Time-Ms" in r.headers and "X-Request-ID" in r.headers


def test_database_rejects_duplicate_reminder(world):
    """Even if two scheduler runs race past the EXISTS check, the DB keeps one reminder."""
    from sqlalchemy.exc import IntegrityError

    from app.models import AdminReminderLog, OrderStatus

    oid = world.place()["id"]
    _age_order(oid, 20)
    with SessionLocal() as s:
        assert generate_reminders(s, threshold_minutes=15) == 1
        s.add(AdminReminderLog(order_id=oid, restaurant_id=world.rest_id, order_status=OrderStatus.PLACED,
                               minutes_pending=20, message="dup"))
        with pytest.raises(IntegrityError):
            s.commit()
