"""Regression tests: business-day boundaries follow APP_TIMEZONE, not UTC.

Bug: an order placed at 00:32 IST on Nov 11 (= 19:02 UTC Nov 10) was filed under Nov 10,
so filtering by Nov 11 returned nothing and the owner's "Today" bar was wrong.
"""

from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.core.timeutil import local_day_start, local_today
from app.models import Order


@pytest.fixture(autouse=True)
def ist(monkeypatch, settings):
    monkeypatch.setattr(settings, "APP_TIMEZONE", "Asia/Kolkata")


def _set_created(order_id, when):
    with SessionLocal() as s:
        o = s.get(Order, order_id)
        o.created_at = when
        s.commit()


def test_order_just_after_local_midnight_is_filed_under_local_day(world):
    today = local_today()
    after_midnight = local_day_start(today) + timedelta(minutes=32)   # 00:32 IST today
    before_midnight = local_day_start(today) - timedelta(minutes=5)   # 23:55 IST yesterday
    a = world.place()["id"]
    b = world.place()["id"]
    _set_created(a, after_midnight)
    _set_created(b, before_midnight)

    d = today.isoformat()
    y = (today - timedelta(days=1)).isoformat()
    got_today = world.cust.get("/api/orders", params={"date_from": d, "date_to": d}).json()
    got_yday = world.cust.get("/api/orders", params={"date_from": y, "date_to": y}).json()
    assert [o["id"] for o in got_today["items"]] == [a]
    assert [o["id"] for o in got_yday["items"]] == [b]

    # Sanity: in UTC, 00:32 IST really is the previous calendar day — the UTC-based code
    # would therefore have filed order `a` under yesterday.
    assert after_midnight.date() == today - timedelta(days=1)


def test_owner_today_and_daily_chart_use_local_days(world):
    today = local_today()
    a = world.place()["id"]
    b = world.place()["id"]
    _set_created(a, local_day_start(today) + timedelta(minutes=1))
    _set_created(b, local_day_start(today) - timedelta(minutes=1))

    s = world.owner.get("/api/owner/stats").json()
    assert s["orders_today"] == 1
    bars = {bar["date"]: bar["orders"] for bar in s["revenue_last_7_days"]}
    assert bars[today.isoformat()] == 1
    assert bars[(today - timedelta(days=1)).isoformat()] == 1
    assert s["revenue_last_7_days"][-1]["date"] == today.isoformat()


def test_delivered_today_uses_local_day(world):
    oid = world.place()["id"]
    world.advance_to(oid, "DELIVERED")
    assert world.rider.get("/api/delivery/stats").json()["delivered_today"] == 1
    with SessionLocal() as s:
        s.get(Order, oid).delivered_at = local_day_start(local_today()) - timedelta(minutes=1)
        s.commit()
    assert world.rider.get("/api/delivery/stats").json()["delivered_today"] == 0


def test_invalid_timezone_rejected():
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(APP_TIMEZONE="Mars/Olympus_Mons")
