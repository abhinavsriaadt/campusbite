"""Order lifecycle (SPEC §4): the full happy path driven by all three roles, and every invalid
transition from every status rejected with 400."""

import pytest

from app.services.order_service import GENERIC_STATUS_TARGETS, TRANSITIONS, S

ALL = [S.PLACED, S.ACCEPTED, S.PREPARING, S.READY, S.ASSIGNED, S.OUT_FOR_DELIVERY, S.DELIVERED, S.CANCELLED, S.REFUNDED]
RIDER_TARGETS = {S.OUT_FOR_DELIVERY, S.DELIVERED}


def _order_in(world, status: S) -> int:
    oid = world.place()["id"]
    if status == S.CANCELLED:
        assert world.cust.post(f"/api/orders/{oid}/cancel", {"reason": "Changed my mind"}).status_code == 200
    elif status == S.REFUNDED:
        world.advance_to(oid, "DELIVERED")
        world.cust.post(f"/api/orders/{oid}/return", {"reason": "Food arrived cold and spilled"})
        rid = world.owner.get("/api/returns", params={"status": "pending"}).json()["items"][0]["id"]
        assert world.owner.post(f"/api/returns/{rid}/approve").status_code == 200
    elif status != S.PLACED:
        world.advance_to(oid, status.value)
    assert world.cust.get(f"/api/orders/{oid}").json()["status"] == status.value
    return oid


def test_happy_path_by_all_three_roles(world):
    """Customer places → owner accepts/prepares/readies/assigns → rider picks up and delivers."""
    oid = world.place()["id"]
    steps = [
        (world.owner, "PATCH", "status", {"status": "ACCEPTED"}),
        (world.owner, "PATCH", "status", {"status": "PREPARING"}),
        (world.owner, "PATCH", "status", {"status": "READY"}),
        (world.owner, "POST", "assign", {"delivery_partner_id": world.rider.user["id"]}),
        (world.rider, "PATCH", "status", {"status": "OUT_FOR_DELIVERY"}),
        (world.rider, "PATCH", "status", {"status": "DELIVERED"}),
    ]
    expected = ["ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]
    for (actor, method, action, body), want in zip(steps, expected, strict=True):
        r = actor.patch(f"/api/orders/{oid}/{action}", body) if method == "PATCH" else actor.post(f"/api/orders/{oid}/{action}", body)
        assert r.status_code == 200, (want, r.text)
        assert r.json()["status"] == want
        # The customer tracks every step.
        assert world.cust.get(f"/api/orders/{oid}").json()["status"] == want
    history = world.cust.get(f"/api/orders/{oid}").json()["status_history"]
    assert [h["to_status"] for h in history] == ["PLACED", *expected]


@pytest.mark.parametrize("current", ALL, ids=lambda s: s.value)
def test_every_invalid_generic_transition_is_400(world, current):
    oid = _order_in(world, current)
    rider_sees_it = current in (S.ASSIGNED, S.OUT_FOR_DELIVERY, S.DELIVERED, S.REFUNDED)
    checked = 0
    for target in GENERIC_STATUS_TARGETS:
        if (current, target) in TRANSITIONS:
            continue  # valid pairs are covered by the happy path
        actors = [world.owner] + ([world.rider] if rider_sees_it else [])
        for actor in actors:
            r = actor.patch(f"/api/orders/{oid}/status", {"status": target.value})
            assert r.status_code == 400, (current.value, target.value, actor.user["role"], r.text)
            assert "Invalid status transition" in r.json()["detail"]
            checked += 1
    assert checked > 0
    # Nothing changed.
    assert world.cust.get(f"/api/orders/{oid}").json()["status"] == current.value


@pytest.mark.parametrize("current", [s for s in ALL if s != S.PLACED], ids=lambda s: s.value)
def test_cancel_only_in_placed(world, current):
    oid = _order_in(world, current)
    r = world.cust.post(f"/api/orders/{oid}/cancel", {"reason": "Too late"})
    assert r.status_code == 400, r.text
    if current == S.DELIVERED:
        assert r.json()["detail"] == "Delivered orders cannot be cancelled"


@pytest.mark.parametrize("current", [s for s in ALL if s not in (S.READY, S.ASSIGNED)], ids=lambda s: s.value)
def test_assign_only_when_ready(world, current):
    """READY → ASSIGNED; an ASSIGNED order may be re-assigned before pickup. Anything else is 400."""
    oid = _order_in(world, current)
    r = world.owner.post(f"/api/orders/{oid}/assign", {"delivery_partner_id": world.rider2.user["id"]})
    assert r.status_code == 400, (current.value, r.text)


@pytest.mark.parametrize("current", [s for s in ALL if s not in (S.DELIVERED, S.REFUNDED)], ids=lambda s: s.value)
def test_review_and_return_only_after_delivery(world, current):
    oid = _order_in(world, current)
    assert world.cust.post(f"/api/orders/{oid}/review", {"rating": 5}).status_code == 400
    r = world.cust.post(f"/api/orders/{oid}/return", {"reason": "Food arrived cold and spilled"})
    assert r.status_code == 400, (current.value, r.text)


def test_wrong_role_on_valid_transition_is_403(world):
    oid = _order_in(world, S.ASSIGNED)
    # ASSIGNED → OUT_FOR_DELIVERY is valid, but only for the rider.
    assert world.owner.patch(f"/api/orders/{oid}/status", {"status": "OUT_FOR_DELIVERY"}).status_code == 403
    assert world.cust.patch(f"/api/orders/{oid}/status", {"status": "OUT_FOR_DELIVERY"}).status_code == 403
    oid2 = _order_in(world, S.PLACED)
    assert world.rider.patch(f"/api/orders/{oid2}/status", {"status": "ACCEPTED"}).status_code == 404  # not theirs
    assert world.cust.patch(f"/api/orders/{oid2}/status", {"status": "ACCEPTED"}).status_code == 403


def test_transition_table_matches_spec():
    """SPEC §4: the only forward moves, and who makes them."""
    assert {(a.value, b.value): sorted(r.value for r in roles) for (a, b), roles in TRANSITIONS.items()} == {
        ("PLACED", "ACCEPTED"): ["restaurant_owner"],
        ("PLACED", "CANCELLED"): ["customer", "restaurant_owner"],
        ("ACCEPTED", "PREPARING"): ["restaurant_owner"],
        ("PREPARING", "READY"): ["restaurant_owner"],
        ("READY", "ASSIGNED"): ["restaurant_owner"],
        ("ASSIGNED", "OUT_FOR_DELIVERY"): ["delivery_partner"],
        ("OUT_FOR_DELIVERY", "DELIVERED"): ["delivery_partner"],
        ("DELIVERED", "REFUNDED"): ["restaurant_owner"],
    }
    assert set(RIDER_TARGETS) <= GENERIC_STATUS_TARGETS
