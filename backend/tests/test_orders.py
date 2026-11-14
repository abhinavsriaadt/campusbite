def test_place_order_computes_totals_and_mock_payment(world):
    o = world.place()
    # 2*220 + 3*45.5 = 576.50 ; tax 5% = 28.83 ; delivery 40
    assert o["subtotal"] == 576.5
    assert o["tax"] == 28.83
    assert o["delivery_fee"] == 40.0
    assert o["total_amount"] == 645.33
    assert o["status"] == "PLACED"
    assert o["payment_status"] == "mock_paid"
    assert len(o["payments"]) == 1
    p = o["payments"][0]
    assert p["entry_type"] == "PAYMENT" and p["status"] == "SUCCESS" and p["amount"] == 645.33
    assert "cancel" in o["allowed_actions"]


def test_client_cannot_set_price(world):
    r = world.cust.post("/api/orders", {"restaurant_id": world.rest_id, "delivery_address": "Addr 12345",
                                        "items": [{"menu_item_id": world.d1["id"], "quantity": 1, "price": 1}]})
    assert r.status_code == 201 and r.json()["subtotal"] == 220.0


def test_unavailable_or_foreign_items_rejected(world):
    world.owner.patch(f"/api/owner/menu-items/{world.d1['id']}/availability", {"is_available": False})
    r = world.cust.post("/api/orders", {"restaurant_id": world.rest_id, "delivery_address": "Addr 12345",
                                        "items": [{"menu_item_id": world.d1["id"], "quantity": 1}]})
    assert r.status_code == 409
    other = world.owner2.post("/api/owner/menu-items", {"name": "Other Dish", "price": 10}).json()
    r = world.cust.post("/api/orders", {"restaurant_id": world.rest_id, "delivery_address": "Addr 12345",
                                        "items": [{"menu_item_id": other["id"], "quantity": 1}]})
    assert r.status_code == 422


def test_closed_restaurant_rejects_orders(world):
    world.owner.patch("/api/owner/restaurant", {"is_open": False})
    r = world.cust.post("/api/orders", {"restaurant_id": world.rest_id, "delivery_address": "Addr 12345",
                                        "items": [{"menu_item_id": world.d2["id"], "quantity": 1}]})
    assert r.status_code == 409


def test_full_lifecycle(world):
    o = world.place()
    oid = o["id"]
    final = world.advance_to(oid, "DELIVERED")
    assert final["status"] == "DELIVERED" and final["delivered_at"]
    statuses = [h["to_status"] for h in final["status_history"]]
    assert statuses == ["PLACED", "ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]
    assert world.cust.get(f"/api/orders/{oid}").json()["delivery_partner"]["name"]


def test_invalid_transitions_rejected(world):
    oid = world.place()["id"]
    # skip a step
    assert world.owner.patch(f"/api/orders/{oid}/status", {"status": "READY"}).status_code == 400
    # customer cannot accept
    assert world.cust.patch(f"/api/orders/{oid}/status", {"status": "ACCEPTED"}).status_code == 403
    # special statuses not settable via generic endpoint
    assert world.owner.patch(f"/api/orders/{oid}/status", {"status": "ASSIGNED"}).status_code == 422
    assert world.owner.patch(f"/api/orders/{oid}/status", {"status": "REFUNDED"}).status_code == 422
    # bogus status
    assert world.owner.patch(f"/api/orders/{oid}/status", {"status": "TELEPORTED"}).status_code == 422
    # assign before READY
    r = world.owner.post(f"/api/orders/{oid}/assign", {"delivery_partner_id": world.rider.user["id"]})
    assert r.status_code == 400
    world.advance_to(oid, "READY")
    # owner cannot mark out for delivery
    assert world.owner.patch(f"/api/orders/{oid}/status", {"status": "OUT_FOR_DELIVERY"}).status_code == 400
    # cannot assign a customer as rider
    r = world.owner.post(f"/api/orders/{oid}/assign", {"delivery_partner_id": world.cust.user["id"]})
    assert r.status_code == 422


def test_delivery_partner_scope(world):
    oid = world.place()["id"]
    world.advance_to(oid, "ASSIGNED")
    # other rider can't see or update it
    assert world.rider2.get(f"/api/orders/{oid}").status_code == 404
    assert world.rider2.patch(f"/api/orders/{oid}/status", {"status": "OUT_FOR_DELIVERY"}).status_code == 404
    assert world.rider2.get("/api/orders").json()["total"] == 0
    # assigned rider sees customer delivery details but no payment ledger
    o = world.rider.get(f"/api/orders/{oid}").json()
    assert o["customer"]["phone"] == "9000000001" and o["delivery_address"]
    assert o["payments"] == []
    assert world.rider.get(f"/api/orders/{oid}/payments").status_code == 403
    # rider can't jump straight to DELIVERED
    assert world.rider.patch(f"/api/orders/{oid}/status", {"status": "DELIVERED"}).status_code == 400


def test_reassign_before_pickup(world):
    oid = world.place()["id"]
    world.advance_to(oid, "ASSIGNED")
    r = world.owner.post(f"/api/orders/{oid}/assign", {"delivery_partner_id": world.rider2.user["id"]})
    assert r.status_code == 200 and r.json()["delivery_partner"]["id"] == world.rider2.user["id"]
    assert world.rider.get(f"/api/orders/{oid}").status_code == 404


def test_customer_and_owner_isolation(world):
    oid = world.place()["id"]
    assert world.cust2.get(f"/api/orders/{oid}").status_code == 404
    assert world.cust2.post(f"/api/orders/{oid}/cancel").status_code == 404
    assert world.owner2.get(f"/api/orders/{oid}").status_code == 404
    assert world.owner2.patch(f"/api/orders/{oid}/status", {"status": "ACCEPTED"}).status_code == 404
    assert world.cust2.get("/api/orders").json()["total"] == 0
    assert world.owner2.get("/api/orders").json()["total"] == 0
    assert world.owner.get("/api/orders").json()["total"] == 1


def test_cancel_rules_and_auto_refund(world):
    oid = world.place()["id"]
    r = world.cust.post(f"/api/orders/{oid}/cancel", {"reason": "Ordered by mistake"})
    assert r.status_code == 200
    o = r.json()
    assert o["status"] == "CANCELLED" and o["payment_status"] == "refunded"
    assert [p["entry_type"] for p in o["payments"]] == ["PAYMENT", "REFUND"]
    # cannot cancel twice
    assert world.cust.post(f"/api/orders/{oid}/cancel").status_code == 400

    oid2 = world.place()["id"]
    world.advance_to(oid2, "ACCEPTED")
    assert world.cust.post(f"/api/orders/{oid2}/cancel").status_code == 400

    oid3 = world.place()["id"]
    world.advance_to(oid3, "DELIVERED")
    r = world.cust.post(f"/api/orders/{oid3}/cancel")
    assert r.status_code == 400 and "Delivered" in r.json()["detail"]


def test_owner_can_reject_placed_order(world):
    oid = world.place()["id"]
    r = world.owner.post(f"/api/orders/{oid}/cancel", {"reason": "Out of stock"})
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
    assert world.rider.post(f"/api/orders/{oid}/cancel").status_code == 403


def test_filters_and_pagination(world):
    ids = [world.place()["id"] for _ in range(3)]
    world.advance_to(ids[0], "ACCEPTED")
    c = world.cust
    assert c.get("/api/orders", params={"status": "PLACED"}).json()["total"] == 2
    assert c.get("/api/orders", params={"status": "PLACED,ACCEPTED"}).json()["total"] == 3
    assert c.get("/api/orders", params={"status": "nonsense"}).status_code == 422
    p = c.get("/api/orders", params={"page_size": 2, "page": 2}).json()
    assert p["pages"] == 2 and len(p["items"]) == 1
    assert c.get("/api/orders", params={"date_from": "2000-01-01", "date_to": "2000-01-02"}).json()["total"] == 0
    assert c.get("/api/orders", params={"date_from": "2030-01-02", "date_to": "2030-01-01"}).status_code == 422
    assert c.get("/api/orders", params={"scope": "active"}).json()["total"] == 3


def test_quote_matches_order_and_validates(world):
    items = [{"menu_item_id": world.d1["id"], "quantity": 2}, {"menu_item_id": world.d2["id"], "quantity": 3}]
    q = world.cust.post("/api/orders/quote", {"restaurant_id": world.rest_id, "items": items})
    assert q.status_code == 200
    o = world.place(items=items)
    assert q.json()["total"] == o["total_amount"] == 645.33
    assert world.owner.post("/api/orders/quote", {"restaurant_id": world.rest_id, "items": items}).status_code == 403
    world.owner.patch(f"/api/owner/menu-items/{world.d1['id']}/availability", {"is_available": False})
    r = world.cust.post("/api/orders/quote", {"restaurant_id": world.rest_id, "items": items})
    assert r.status_code == 409 and "Paneer Tikka" in r.json()["detail"]


def test_order_list_includes_item_preview_and_stays_scoped(world):
    mine = world.place()  # 2 × Paneer Tikka, 3 × Butter Naan
    world.place(actor=world.cust2, items=[{"menu_item_id": world.d2["id"], "quantity": 1}])

    items = world.cust.get("/api/orders").json()["items"]
    assert [o["id"] for o in items] == [mine["id"]]
    assert items[0]["items_preview"] == [{"name": "Paneer Tikka", "quantity": 2}, {"name": "Butter Naan", "quantity": 3}]
    assert set(items[0]["restaurant"]) == {"id", "name", "phone", "image_url"}
    assert items[0]["contact_phone"] == "9000000001" and items[0]["delivered_at"] is None
    # The owner board sees both orders; a rider sees none until assigned.
    assert world.owner.get("/api/orders?scope=active").json()["total"] == 2
    assert world.rider.get("/api/orders").json()["total"] == 0
