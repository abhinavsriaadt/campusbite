"""Email + password auth: register/login return a JWT, /auth/me, rate limit, role guards."""

from app.core.database import SessionLocal
from app.models import User
from tests.conftest import register

PW = "Passw0rd!"


def _login(client, email, password=PW):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_register_returns_token_and_signs_in(client):
    r = client.post("/api/auth/register", json={"name": "Alice Rao", "email": "  Alice@Example.com ", "password": PW})
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer" and body["access_token"] and body["expires_in"] > 0
    assert body["user"]["email"] == "alice@example.com" and body["user"]["role"] == "customer"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["name"] == "Alice Rao"


def test_duplicate_email_is_409_case_insensitive(client):
    register(client, "dup@test.com")
    r = client.post("/api/auth/register", json={"name": "X Y", "email": "DUP@test.com ", "password": PW})
    assert r.status_code == 409 and r.json()["detail"] == "An account with this email already exists."


def test_login_returns_token_and_me_works(client):
    register(client, "alice@example.com", name="Alice Rao")
    r = _login(client, " Alice@Example.com")
    assert r.status_code == 200 and r.json()["user"]["email"] == "alice@example.com"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.status_code == 200 and me.json()["name"] == "Alice Rao"


def test_wrong_password_and_unknown_user_get_the_same_401(client):
    register(client, "pw@test.com")
    a = _login(client, "pw@test.com", "Wrong1234")
    b = _login(client, "ghost@test.com", "Wrong1234")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "Invalid email or password."}


def test_password_is_bcrypt_hashed(client):
    register(client, "hash@test.com")
    with SessionLocal() as s:
        u = s.query(User).filter_by(email="hash@test.com").one()
        assert u.password_hash.startswith("$2") and PW not in u.password_hash


def test_password_rules(client):
    for weak in ("short1", "lettersonly", "12345678"):
        r = client.post("/api/auth/register", json={"name": "Weak", "email": "w@test.com", "password": weak})
        assert r.status_code == 422


def test_owner_requires_restaurant_and_gets_one(client):
    r = client.post("/api/auth/register", json={"name": "Own Er", "email": "o@test.com",
                                                 "password": PW, "role": "restaurant_owner"})
    assert r.status_code == 422
    o = register(client, "o2@test.com", "restaurant_owner")
    assert o.user["restaurant_id"] is not None
    assert o.get("/api/owner/restaurant").status_code == 200  # usable straight away


def test_login_rate_limit(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 3)
    for _ in range(3):
        assert _login(client, "x@test.com", "Wrong1234").status_code == 401
    r = _login(client, "x@test.com", "Wrong1234")
    assert r.status_code == 429 and "Retry-After" in r.headers
    assert r.json()["detail"] == "Too many login attempts. Try again in a few minutes."


def test_protected_endpoints_require_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/orders").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_role_guards(world):
    # customer cannot hit owner endpoints
    assert world.cust.get("/api/owner/stats").status_code == 403
    assert world.cust.get("/api/owner/restaurant").status_code == 403
    assert world.cust.post("/api/owner/menu-items", {"name": "Hack", "price": 1}).status_code == 403
    # owner cannot place orders or use AI
    assert world.owner.post("/api/orders", {"restaurant_id": world.rest_id, "items": [
        {"menu_item_id": world.d1["id"], "quantity": 1}], "delivery_address": "Somewhere 1"}).status_code == 403
    assert world.owner.post("/api/ai/insights", {"question": "summarise"}).status_code == 403
    # rider cannot manage menus
    assert world.rider.get("/api/owner/menu-items").status_code == 403
