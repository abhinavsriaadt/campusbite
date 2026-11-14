"""Categories, the category filter (many-to-many), menu tags and the Lucknow seed data."""

import json

import pytest

from app.core.database import SessionLocal
from app.models import Category, MenuItem, Restaurant, User
from app.seed import DATA_FILE, demo_password, seed
from tests.conftest import register


@pytest.fixture
def tagged(client, world):
    """Two restaurants in categories; one dish tagged."""
    with SessionLocal() as s:
        rolls = Category(slug="rolls", name="Rolls", description="Kathi rolls")
        mughlai = Category(slug="mughlai", name="Mughlai", description="Kebabs")
        s.add_all([rolls, mughlai, Category(slug="cake", name="Cake")])
        r1 = s.get(Restaurant, world.rest_id)
        r1.categories = [mughlai, rolls]
        r1.primary_category = mughlai
        r1.cost_for_two = 400
        s.get(MenuItem, world.d1["id"]).tags = ["mughlai"]
        r2 = s.query(Restaurant).filter(Restaurant.id != world.rest_id).one()
        r2.categories = [rolls]
        s.commit()
    return world


def test_categories_with_counts(client, tagged):
    cats = client.get("/api/categories").json()
    assert [(c["slug"], c["restaurant_count"]) for c in cats] == [("rolls", 2), ("mughlai", 1), ("cake", 0)]
    assert cats[0] == {"slug": "rolls", "name": "Rolls", "description": "Kathi rolls", "restaurant_count": 2}


def test_category_filter_uses_join_table(client, tagged):
    def names(**p):
        return sorted(r["name"] for r in client.get("/api/restaurants", params=p).json()["items"])

    assert len(names(category="rolls")) == 2
    assert len(names(category="mughlai")) == 1
    assert names(category="cake") == [] and names(category="nope") == []
    item = client.get("/api/restaurants", params={"category": "mughlai", "size": 5}).json()
    assert item["page_size"] == 5
    r = item["items"][0]
    assert r["primary_category"] == {"slug": "mughlai", "name": "Mughlai"}
    assert [c["slug"] for c in r["categories"]] == ["rolls", "mughlai"]  # category order
    assert r["cost_for_two"] == 400 and r["avg_rating"] == 0 and r["review_count"] == 0


def test_unverified_owner_restaurants_not_counted(client, tagged):
    client.post("/api/auth/register", json={"name": "New Owner", "email": "new@test.com", "password": "Passw0rd!",
                                             "role": "restaurant_owner", "restaurant": {"name": "Pending Rolls"}})
    with SessionLocal() as s:
        r = s.query(Restaurant).filter_by(name="Pending Rolls").one()
        r.categories = [s.query(Category).filter_by(slug="rolls").one()]
        s.commit()
    assert {c["slug"]: c["restaurant_count"] for c in client.get("/api/categories").json()}["rolls"] == 2


def test_menu_tag_filter_and_tags_in_output(client, tagged):
    r = client.get(f"/api/restaurants/{tagged.rest_id}/menu", params={"tag": "mughlai"}).json()
    assert r["total"] == 1 and r["sections"][0]["items"][0]["tags"] == ["mughlai"]
    assert client.get(f"/api/restaurants/{tagged.rest_id}/menu", params={"tag": "cake"}).json()["sections"] == []


# ---------------------------------------------------------------------------- seed data
def test_seed_file_shape():
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    assert len(data["restaurants"]) == 45 and len(data["categories"]) == 9
    assert sum(len(r["menu"]) for r in data["restaurants"]) == 1000
    assert all(20 <= len(r["menu"]) <= 25 for r in data["restaurants"])
    assert demo_password(data) == "Password@123"


def test_seed_and_reset(client):
    keeper = register(client, "real.person@gmail.com")  # self-registered user survives a reset
    counts = seed()
    assert counts == {"restaurants": 45, "categories": 9, "menu_items": 1000, "orders": 20}
    assert seed() is None  # idempotent without --reset

    def names(**p):
        return [r["name"] for r in client.get("/api/restaurants", params={**p, "size": 100}).json()["items"]]

    assert "Tunday Kababi" in names(category="mughlai") and "Tunday Kababi" in names(category="rolls")
    assert len(names(category="sweets")) == 8
    assert {c["slug"]: c["restaurant_count"] for c in client.get("/api/categories").json()}["cafe"] == 10

    # demo logins: verified, password from the data file, OTP still applies
    r = client.post("/api/auth/login", json={"email": "aarav@campusbite.dev", "password": "Password@123"})
    assert r.status_code == 200 and r.json()["status"] == "otp_required"

    owner_before = client.post("/api/auth/login", json={"email": "owner.starbucks@campusbite.dev", "password": "Password@123"})
    assert owner_before.status_code == 200

    counts = seed(reset_first=True)
    assert counts == {"restaurants": 45, "categories": 9, "menu_items": 1000, "orders": 20}
    with SessionLocal() as s:
        assert s.query(User).filter_by(email="real.person@gmail.com").one().id == keeper.user["id"]
        assert s.query(User).filter_by(email="aarav@campusbite.dev").count() == 1
        assert s.query(Restaurant).count() == 45
