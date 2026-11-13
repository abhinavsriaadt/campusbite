"""Email OTP: signup verification, login second step, resend, lockout, expiry, rate limits."""

import logging
from datetime import timedelta

import pytest

from app.core.database import SessionLocal, utcnow
from app.core.security import create_access_token
from app.models import OtpCode, Restaurant, User
from app.services.mailer import render_otp_email
from tests.conftest import OUTBOX, last_code, register

PW = "Passw0rd!"


def _signup(client, email="neha@test.com", **extra):
    body = {"name": "Neha Rao", "email": email, "password": PW, "role": "customer", **extra}
    return client.post("/api/auth/register", json=body)


def _verify(client, email, code, path="/api/auth/verify-email"):
    return client.post(path, json={"email": email, "code": code})


def _user(email):
    with SessionLocal() as s:
        return s.query(User).filter_by(email=email).one()


def _age_codes(email, purpose, seconds):
    """Back-date every code for (email, purpose), e.g. to get past the resend cooldown."""
    with SessionLocal() as s:
        uid = s.query(User.id).filter_by(email=email).scalar()
        for o in s.query(OtpCode).filter_by(user_id=uid, purpose=purpose):
            o.created_at -= timedelta(seconds=seconds)
        s.commit()


def test_register_returns_no_token_and_user_is_unverified(client):
    r = _signup(client)
    assert r.status_code == 201
    body = r.json()
    assert "access_token" not in body
    assert body == {"status": "verification_required", "email": "n***a@test.com", "purpose": "signup",
                    "resend_in": 60, "detail": None}
    assert _user("neha@test.com").is_verified is False
    with SessionLocal() as s:
        stored = s.query(OtpCode).one()
        assert stored.code_hash != last_code("neha@test.com") and len(stored.code_hash) == 64


def test_unverified_user_cannot_use_protected_api_even_with_forged_token(client):
    _signup(client)
    token, _ = create_access_token(_user("neha@test.com").id, "customer")
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403 and r.json()["detail"] == "Email not verified"
    assert client.get("/api/orders", headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_verify_email_returns_token_and_code_cannot_be_reused(client):
    _signup(client)
    code = last_code("neha@test.com")
    r = _verify(client, "neha@test.com", code)
    assert r.status_code == 200 and r.json()["token_type"] == "bearer"
    assert r.json()["user"]["email"] == "neha@test.com"
    assert _user("neha@test.com").is_verified is True
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.status_code == 200
    assert _verify(client, "neha@test.com", code).status_code == 400


def test_wrong_code_counts_down_and_locks_after_max_attempts(client):
    _signup(client)
    good = last_code("neha@test.com")
    bad = "000000" if good != "000000" else "111111"
    for left in (4, 3, 2, 1, 0):
        r = _verify(client, "neha@test.com", bad)
        assert r.status_code == 400
        assert r.json() == {"detail": "Incorrect code.", "code": "invalid", "attempts_left": left}
    r = _verify(client, "neha@test.com", good)  # even the right code is refused now
    assert r.status_code == 400 and r.json()["code"] == "locked"


def test_expired_code(client):
    _signup(client)
    with SessionLocal() as s:
        otp = s.query(OtpCode).one()
        otp.expires_at = utcnow() - timedelta(seconds=1)
        s.commit()
    r = _verify(client, "neha@test.com", last_code("neha@test.com"))
    assert r.status_code == 400 and r.json() == {"detail": "Code expired. Request a new one.", "code": "expired"}


def test_code_format_is_validated(client):
    _signup(client)
    for bad in ("12345", "1234567", "12a456", ""):
        assert _verify(client, "neha@test.com", bad).status_code == 422
    # surrounding whitespace is fine
    assert _verify(client, "neha@test.com", f" {last_code('neha@test.com')} ").status_code == 200


def test_resend_cooldown_and_new_code_invalidates_old(client):
    _signup(client)
    first = last_code("neha@test.com")
    r = client.post("/api/auth/otp/resend", json={"email": "neha@test.com", "purpose": "signup"})
    assert r.status_code == 429
    assert 0 < int(r.headers["Retry-After"]) <= 60 and r.json()["retry_after"] == int(r.headers["Retry-After"])

    _age_codes("neha@test.com", "signup", 61)
    r = client.post("/api/auth/otp/resend", json={"email": "neha@test.com", "purpose": "signup"})
    assert r.status_code == 200 and r.json()["detail"] == "If the account exists, a new code has been sent."
    second = last_code("neha@test.com")
    if first != second:  # 1-in-a-million collision would make this check meaningless
        assert _verify(client, "neha@test.com", first).status_code == 400
    assert _verify(client, "neha@test.com", second).status_code == 200


def test_resend_does_not_reveal_accounts(client):
    register(client, "verified@test.com")
    sent = len(OUTBOX)
    for email, purpose in (("ghost@test.com", "signup"), ("ghost@test.com", "login"), ("verified@test.com", "signup")):
        r = client.post("/api/auth/otp/resend", json={"email": email, "purpose": purpose})
        assert r.status_code == 200 and r.json()["detail"] == "If the account exists, a new code has been sent."
    assert len(OUTBOX) == sent  # nothing was actually sent


def test_wrong_password_does_not_say_which_part_was_wrong(client):
    register(client, "pw@test.com")
    a = client.post("/api/auth/login", json={"email": "pw@test.com", "password": "Wrong1234"})
    b = client.post("/api/auth/login", json={"email": "nobody@test.com", "password": "Wrong1234"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "Invalid email or password."}


def test_unverified_login_returns_verification_required(client):
    _signup(client)
    r = client.post("/api/auth/login", json={"email": "neha@test.com", "password": PW})
    assert r.status_code == 403
    assert r.json()["status"] == "verification_required" and r.json()["purpose"] == "signup"
    assert 0 < r.json()["resend_in"] <= 60  # reused code: the remaining cooldown, not a fresh 60
    assert "access_token" not in r.json()
    # within the cooldown no second code is sent; the first one still works
    assert len([o for o in OUTBOX if o[0] == "neha@test.com"]) == 1
    assert _verify(client, "neha@test.com", last_code("neha@test.com")).status_code == 200


def test_unverified_login_after_cooldown_sends_a_fresh_code(client):
    _signup(client)
    _age_codes("neha@test.com", "signup", 61)
    client.post("/api/auth/login", json={"email": "neha@test.com", "password": PW})
    assert len([o for o in OUTBOX if o[0] == "neha@test.com"]) == 2


def test_verified_login_requires_otp_then_returns_token(client):
    register(client, "rider@test.com", "delivery_partner")
    r = client.post("/api/auth/login", json={"email": "rider@test.com", "password": PW})
    assert r.status_code == 200
    assert r.json() == {"status": "otp_required", "email": "r***r@test.com", "purpose": "login",
                        "resend_in": 60, "detail": None}
    # a signup code can't be used to log in, and vice versa
    assert _verify(client, "rider@test.com", last_code("rider@test.com", "signup"), "/api/auth/login/verify").status_code == 400
    r = _verify(client, "rider@test.com", last_code("rider@test.com", "login"), "/api/auth/login/verify")
    assert r.status_code == 200 and r.json()["user"]["role"] == "delivery_partner"


def test_logging_in_again_after_using_a_code_gets_a_fresh_one(client):
    register(client, "again@test.com")
    for _ in range(2):  # second round is well inside the 60s cooldown
        assert client.post("/api/auth/login", json={"email": "again@test.com", "password": PW}).status_code == 200
        r = _verify(client, "again@test.com", last_code("again@test.com", "login"), "/api/auth/login/verify")
        assert r.status_code == 200
    assert len([o for o in OUTBOX if o[:2] == ("again@test.com", "login")]) == 2


def test_login_without_otp_when_disabled(client, settings, monkeypatch):
    register(client, "plain@test.com")
    monkeypatch.setattr(settings, "OTP_ON_LOGIN", False)
    r = client.post("/api/auth/login", json={"email": "plain@test.com", "password": PW})
    assert r.status_code == 200 and "access_token" in r.json()


def test_reregister_unverified_updates_details_but_verified_is_409(client):
    _signup(client, name="Old Name")
    _age_codes("neha@test.com", "signup", 61)
    r = client.post("/api/auth/register", json={"name": "New Name", "email": "neha@test.com", "password": "NewPass99",
                                                 "role": "restaurant_owner", "restaurant": {"name": "Neha's Kitchen"}})
    assert r.status_code == 200 and r.json()["status"] == "verification_required"
    u = _user("neha@test.com")
    assert u.name == "New Name" and u.role.value == "restaurant_owner"
    assert _verify(client, "neha@test.com", last_code("neha@test.com")).status_code == 200
    # the new password is the one that counts
    assert client.post("/api/auth/login", json={"email": "neha@test.com", "password": "NewPass99"}).status_code == 200

    r = _signup(client)
    assert r.status_code == 409
    assert r.json()["detail"] == "An account with this email already exists. Log in instead."


def test_reregister_inside_cooldown_is_429(client):
    _signup(client)
    r = _signup(client)
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_email_is_trimmed_and_case_insensitive(client):
    r = _signup(client, email="  Neha.Rao@Test.COM ")
    assert r.status_code == 201
    assert _user("neha.rao@test.com").email == "neha.rao@test.com"
    assert _verify(client, " NEHA.RAO@test.com", last_code("neha.rao@test.com")).status_code == 200
    r = client.post("/api/auth/login", json={"email": "Neha.Rao@TEST.com  ", "password": PW})
    assert r.status_code == 200 and r.json()["status"] == "otp_required"
    assert _signup(client, email="NEHA.RAO@test.com").status_code == 409


def test_password_rules(client):
    for weak in ("short1", "lettersonly", "12345678"):
        assert _signup(client, password=weak).status_code == 422


def test_unverified_owner_restaurant_is_hidden(client):
    r = client.post("/api/auth/register", json={"name": "Own Er", "email": "own@test.com", "password": PW,
                                                 "role": "restaurant_owner", "restaurant": {"name": "Hidden Dhaba"}})
    assert r.status_code == 201
    with SessionLocal() as s:
        rid = s.query(Restaurant.id).scalar()
    assert all(x["name"] != "Hidden Dhaba" for x in client.get("/api/restaurants").json()["items"])
    assert client.get(f"/api/restaurants/{rid}").status_code == 404
    _verify(client, "own@test.com", last_code("own@test.com"))
    assert client.get(f"/api/restaurants/{rid}").status_code == 200


def test_auth_endpoints_are_rate_limited(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_RATE_LIMIT", 3)
    for _ in range(3):
        client.post("/api/auth/login", json={"email": "x@test.com", "password": "Wrong1234"})
    r = client.post("/api/auth/login", json={"email": "x@test.com", "password": "Wrong1234"})
    assert r.status_code == 429 and r.json()["detail"] == "Too many attempts. Try again in a few minutes."
    assert "Retry-After" in r.headers


def test_console_delivery_logs_the_code(client, caplog):
    with caplog.at_level(logging.INFO, logger="campusbite.mailer"):
        _signup(client)
    code = last_code("neha@test.com")
    assert f"[OTP][signup] to=neha@test.com code={code}" in caplog.text
    assert PW not in caplog.text


@pytest.mark.parametrize("purpose,subject,line", [
    ("signup", "Verify your CampusBite account", "Welcome to CampusBite! Use this code to verify your email:"),
    ("login", "Your CampusBite login code", "Never share this code. CampusBite will never ask you for it."),
])
def test_email_templates(purpose, subject, line):
    subj, html, text = render_otp_email("Neha", purpose, "042137")
    assert subj == subject
    assert "042137" in html and "042137" in text and "Hi Neha," in text and line in text
    assert "It expires in 5 minutes." in text and "— Team CampusBite" in text
    assert "letter-spacing:6px" in html and "#E8492F" in html


def test_email_send_failure_never_breaks_the_request(client, settings, monkeypatch):
    from app.services import mailer

    monkeypatch.setattr(settings, "OTP_DELIVERY", "email")
    monkeypatch.setattr(settings, "SMTP_USER", "x@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "app-password")

    def boom(*a, **k):
        raise OSError("smtp down")

    monkeypatch.setattr(mailer, "send_email", boom)
    assert _signup(client).status_code == 201


def test_old_codes_are_purged(client, db):
    from app.services.otp import purge_old_otps

    _signup(client)
    _age_codes("neha@test.com", "signup", 25 * 3600)
    assert purge_old_otps(db) == 1
