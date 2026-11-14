import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="campusbite-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-that-is-long-enough-123456"
os.environ["ENABLE_REMINDER_SCHEDULER"] = "false"
os.environ["OPENAI_API_KEY"] = ""
os.environ["AUTH_RATE_LIMIT"] = "1000"
os.environ["OTP_DELIVERY"] = "console"
os.environ["OTP_ON_LOGIN"] = "true"
os.environ["BCRYPT_ROUNDS"] = "4"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.rate_limit import ai_rate_limiter, auth_rate_limiter  # noqa: E402
from app.services import mailer  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    ai_rate_limiter.reset()
    auth_rate_limiter.reset()
    OUTBOX.clear()
    yield


# Every OTP "sent" during a test, newest last: (email, purpose, code). The real console
# delivery still runs, so the log line is exercised too.
OUTBOX: list[tuple[str, str, str]] = []
_real_deliver = mailer.deliver_otp


@pytest.fixture(autouse=True)
def _capture_otps(monkeypatch):
    def capture(email, name, purpose, code):
        OUTBOX.append((email, purpose, code))
        _real_deliver(email, name, purpose, code)

    monkeypatch.setattr(mailer, "deliver_otp", capture)


def last_code(email, purpose="signup"):
    for e, p, c in reversed(OUTBOX):
        if e == email.strip().lower() and p == purpose:
            return c
    raise AssertionError(f"no {purpose} code sent to {email}")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def settings():
    return get_settings()


# ----------------------------------------------------------------------------- helpers
class Actor:
    def __init__(self, client, data):
        self.client = client
        self.token = data["access_token"]
        self.user = data["user"]
        self.h = {"Authorization": f"Bearer {self.token}"}

    def get(self, url, **kw):
        return self.client.get(url, headers=self.h, **kw)

    def post(self, url, json=None, **kw):
        return self.client.post(url, headers=self.h, json=json or {}, **kw)

    def patch(self, url, json=None, **kw):
        return self.client.patch(url, headers=self.h, json=json or {}, **kw)

    def delete(self, url, **kw):
        return self.client.delete(url, headers=self.h, **kw)


def register(client, email, role="customer", **extra):
    body = {"name": extra.pop("name", email.split("@")[0].title()), "email": email,
            "password": "Passw0rd!", "role": role, **extra}
    if role == "restaurant_owner" and "restaurant" not in body:
        body["restaurant"] = {"name": f"{email.split('@')[0]} Kitchen", "cuisine": "Indian"}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201, r.text
    assert "access_token" not in r.json()
    v = client.post("/api/auth/verify-email", json={"email": email, "code": last_code(email)})
    assert v.status_code == 200, v.text
    return Actor(client, v.json())


@pytest.fixture
def world(client):
    """A restaurant with two dishes, a customer, a second customer and two delivery partners."""
    owner = register(client, "owner@test.com", "restaurant_owner", phone="9876543210")
    owner2 = register(client, "owner2@test.com", "restaurant_owner")
    cust = register(client, "cust@test.com", address="12 MG Marg, Hazratganj, Lucknow", phone="9000000001")
    cust2 = register(client, "cust2@test.com")
    rider = register(client, "rider@test.com", "delivery_partner", phone="9111111111")
    rider2 = register(client, "rider2@test.com", "delivery_partner")

    d1 = owner.post("/api/owner/menu-items", {"name": "Paneer Tikka", "price": 220, "category": "Starters"}).json()
    d2 = owner.post("/api/owner/menu-items", {"name": "Butter Naan", "price": 45.5, "category": "Breads"}).json()
    rest_id = owner.get("/api/owner/restaurant").json()["id"]

    class W:
        pass

    w = W()
    w.owner, w.owner2, w.cust, w.cust2, w.rider, w.rider2 = owner, owner2, cust, cust2, rider, rider2
    w.d1, w.d2, w.rest_id = d1, d2, rest_id

    def place(actor=cust, items=None):
        items = items or [{"menu_item_id": d1["id"], "quantity": 2}, {"menu_item_id": d2["id"], "quantity": 3}]
        r = actor.post("/api/orders", {"restaurant_id": rest_id, "items": items,
                                       "delivery_address": "12 MG Marg, Hazratganj, Lucknow", "payment_method": "upi"})
        assert r.status_code == 201, r.text
        return r.json()

    def advance_to(order_id, target):
        path = ["ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]
        for st in path:
            if st == "ASSIGNED":
                r = owner.post(f"/api/orders/{order_id}/assign", {"delivery_partner_id": rider.user["id"]})
            elif st in ("OUT_FOR_DELIVERY", "DELIVERED"):
                r = rider.patch(f"/api/orders/{order_id}/status", {"status": st})
            else:
                r = owner.patch(f"/api/orders/{order_id}/status", {"status": st})
            assert r.status_code == 200, (st, r.text)
            if st == target:
                return r.json()

    w.place, w.advance_to = place, advance_to
    return w
