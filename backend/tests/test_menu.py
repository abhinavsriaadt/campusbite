def test_owner_menu_crud_and_isolation(world):
    o, o2 = world.owner, world.owner2
    item = o.post("/api/owner/menu-items", {"name": "Dal Makhani", "price": 180, "is_veg": True}).json()
    assert item["price"] == 180.0

    r = o.patch(f"/api/owner/menu-items/{item['id']}", {"price": 199.99, "description": "Slow cooked"})
    assert r.status_code == 200 and r.json()["price"] == 199.99

    r = o.patch(f"/api/owner/menu-items/{item['id']}/availability", {"is_available": False})
    assert r.json()["is_available"] is False

    # Another owner cannot touch this dish
    assert o2.patch(f"/api/owner/menu-items/{item['id']}", {"price": 1}).status_code == 404
    assert o2.delete(f"/api/owner/menu-items/{item['id']}").status_code == 404

    assert o.delete(f"/api/owner/menu-items/{item['id']}").status_code == 204
    assert o.get(f"/api/owner/menu-items/{item['id']}").status_code == 404


def test_invalid_price_rejected(world):
    assert world.owner.post("/api/owner/menu-items", {"name": "Free", "price": 0}).status_code == 422
    assert world.owner.post("/api/owner/menu-items", {"name": "Neg", "price": -5}).status_code == 422


def test_public_menu_search_and_price_filter(client, world):
    rid = world.rest_id
    r = client.get(f"/api/restaurants/{rid}/menu", params={"q": "naan"}).json()
    assert [i["name"] for i in r["items"]] == ["Butter Naan"]
    r = client.get(f"/api/restaurants/{rid}/menu", params={"min_price": 100}).json()
    assert [i["name"] for i in r["items"]] == ["Paneer Tikka"]
    r = client.get(f"/api/restaurants/{rid}/menu", params={"sort": "price_asc"}).json()
    assert [i["name"] for i in r["items"]] == ["Butter Naan", "Paneer Tikka"]
    assert client.get(f"/api/restaurants/{rid}/menu", params={"min_price": 10, "max_price": 5}).status_code == 422

    d = client.get("/api/dishes", params={"q": "paneer", "max_price": 300}).json()
    assert d["total"] == 1 and d["items"][0]["restaurant_name"]


def test_restaurant_listing_pagination(client, world):
    r = client.get("/api/restaurants", params={"page_size": 1}).json()
    assert r["total"] == 2 and r["pages"] == 2 and len(r["items"]) == 1
    assert client.get("/api/restaurants", params={"q": "owner2"}).json()["total"] == 1
