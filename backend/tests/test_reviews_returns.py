def test_review_only_after_delivery_once(world):
    oid = world.place()["id"]
    assert world.cust.post(f"/api/orders/{oid}/review", {"rating": 5}).status_code == 409
    world.advance_to(oid, "DELIVERED")
    assert world.cust2.post(f"/api/orders/{oid}/review", {"rating": 1}).status_code == 404
    assert world.cust.post(f"/api/orders/{oid}/review", {"rating": 6}).status_code == 422
    r = world.cust.post(f"/api/orders/{oid}/review", {"rating": 4, "comment": "Great naan"})
    assert r.status_code == 201 and r.json()["review"]["rating"] == 4
    assert world.cust.post(f"/api/orders/{oid}/review", {"rating": 5}).status_code == 409

    rest = world.cust.get(f"/api/restaurants/{world.rest_id}").json()
    assert rest["rating_avg"] == 4.0 and rest["rating_count"] == 1
    reviews = world.cust.get(f"/api/restaurants/{world.rest_id}/reviews").json()
    assert reviews["total"] == 1 and reviews["items"][0]["comment"] == "Great naan"


def test_return_flow_approve(world):
    oid = world.place()["id"]
    assert world.cust.post(f"/api/orders/{oid}/return", {"reason": "Food arrived cold and spilled"}).status_code == 409
    world.advance_to(oid, "DELIVERED")
    assert world.cust.post(f"/api/orders/{oid}/return", {"reason": "short"}).status_code == 422
    r = world.cust.post(f"/api/orders/{oid}/return", {"reason": "Food arrived cold and spilled"})
    assert r.status_code == 201 and r.json()["return_status"] == "pending"
    # no duplicates
    assert world.cust.post(f"/api/orders/{oid}/return", {"reason": "Trying again with another reason"}).status_code == 409

    rr = world.owner.get("/api/returns", params={"status": "pending"}).json()
    assert rr["total"] == 1
    rid = rr["items"][0]["id"]
    # other owner can't resolve; customer can't resolve
    assert world.owner2.post(f"/api/returns/{rid}/approve").status_code == 404
    assert world.cust.post(f"/api/returns/{rid}/approve").status_code == 403

    r = world.owner.post(f"/api/returns/{rid}/approve", {"note": "Sorry about that"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "approved" and body["payment_status"] == "refunded" and body["order_status"] == "REFUNDED"
    assert world.owner.post(f"/api/returns/{rid}/reject").status_code == 409

    o = world.cust.get(f"/api/orders/{oid}").json()
    assert [p["entry_type"] for p in o["payments"]] == ["PAYMENT", "REFUND"]
    assert o["payments"][1]["amount"] == o["total_amount"]

    stats = world.owner.get("/api/owner/stats").json()
    assert stats["refunded_orders"] == 1 and stats["net_revenue"] == 0.0


def test_return_flow_reject(world):
    oid = world.place()["id"]
    world.advance_to(oid, "DELIVERED")
    world.cust.post(f"/api/orders/{oid}/return", {"reason": "Missing one butter naan"})
    rid = world.cust.get("/api/returns").json()["items"][0]["id"]
    r = world.owner.post(f"/api/returns/{rid}/reject", {"note": "Photo shows all items"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    o = world.cust.get(f"/api/orders/{oid}").json()
    assert o["status"] == "DELIVERED" and o["payment_status"] == "mock_paid"
    assert o["return_request"]["resolution_note"] == "Photo shows all items"
    assert world.rider.get("/api/returns").status_code == 403
