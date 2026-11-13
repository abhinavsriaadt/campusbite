from app.core.database import SessionLocal
from app.models import User
from tests.conftest import last_code, register


def test_register_login_me(client):
    a = register(client, "Alice@Example.com", name="Alice Rao")
    assert a.user["email"] == "alice@example.com"
    assert a.user["role"] == "customer"

    r = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "Passw0rd!"})
    assert r.status_code == 200 and r.json()["status"] == "otp_required"
    r = client.post("/api/auth/login/verify", json={"email": "alice@example.com", "code": last_code("alice@example.com", "login")})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["name"] == "Alice Rao"


def test_password_is_bcrypt_hashed(client):
    register(client, "hash@test.com")
    with SessionLocal() as s:
        u = s.query(User).filter_by(email="hash@test.com").one()
        assert u.password_hash.startswith("$2") and "Passw0rd!" not in u.password_hash


def test_duplicate_email_rejected(client):
    register(client, "dup@test.com")
    r = client.post("/api/auth/register", json={"name": "X Y", "email": "DUP@test.com", "password": "Passw0rd!"})
    assert r.status_code == 409


def test_wrong_password_and_unknown_user(client):
    register(client, "pw@test.com")
    assert client.post("/api/auth/login", json={"email": "pw@test.com", "password": "nope12345"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ghost@test.com", "password": "nope12345"}).status_code == 401


def test_weak_password_rejected(client):
    r = client.post("/api/auth/register", json={"name": "Weak", "email": "w@test.com", "password": "password"})
    assert r.status_code == 422


def test_owner_requires_restaurant_and_gets_one(client):
    r = client.post("/api/auth/register", json={"name": "Own Er", "email": "o@test.com",
                                                 "password": "Passw0rd!", "role": "restaurant_owner"})
    assert r.status_code == 422
    o = register(client, "o2@test.com", "restaurant_owner")
    assert o.user["restaurant_id"] is not None


def test_protected_endpoints_require_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/orders").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_role_guards(world):
    # customer cannot hit owner endpoints
    assert world.cust.get("/api/owner/stats").status_code == 403
    assert world.cust.post("/api/owner/menu-items", {"name": "Hack", "price": 1}).status_code == 403
    # owner cannot place orders or use AI
    assert world.owner.post("/api/orders", {"restaurant_id": world.rest_id, "items": [
        {"menu_item_id": world.d1["id"], "quantity": 1}], "delivery_address": "Somewhere 1"}).status_code == 403
    assert world.owner.post("/api/ai/insights", {"question": "summarise"}).status_code == 403
    # rider cannot manage menus
    assert world.rider.get("/api/owner/menu-items").status_code == 403
