"""Email one-time codes: issue, verify, purge.

Only sha256(code + JWT_SECRET_KEY) is stored. A code expires after OTP_EXPIRY_MINUTES,
allows OTP_MAX_ATTEMPTS wrong guesses, and is consumed on first successful use. Issuing a
new code consumes every older code for the same (user, purpose).
"""

import hashlib
import hmac
import math
import re
import secrets
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import utcnow
from app.core.errors import ApiError
from app.models import OtpCode, User

PURPOSES = ("signup", "login")
_CODE_RE = re.compile(r"^\d{6}$")


def _hash(code: str) -> str:
    return hashlib.sha256((code + get_settings().JWT_SECRET_KEY).encode("utf-8")).hexdigest()


def _newest(db: Session, user: User, purpose: str, unconsumed_only: bool = False) -> OtpCode | None:
    stmt = select(OtpCode).where(OtpCode.user_id == user.id, OtpCode.purpose == purpose)
    if unconsumed_only:
        stmt = stmt.where(OtpCode.consumed_at.is_(None))
    return db.scalar(stmt.order_by(OtpCode.created_at.desc(), OtpCode.id.desc()).limit(1))


def issue_otp(db: Session, user: User, purpose: str) -> str:
    """Create a fresh code for (user, purpose) and commit.

    Raises 429 (with retry_after) if the newest code is unused and younger than OTP_RESEND_SECONDS."""
    assert purpose in PURPOSES and user.id is not None  # flush a new user before issuing
    s = get_settings()
    now = utcnow()
    last = _newest(db, user, purpose)
    # The cooldown protects an inbox from repeated sends while a code is still usable. Once
    # the newest code has been used (e.g. log in, log out, log in again), a new one is due now.
    if last is not None and last.consumed_at is None:
        wait = s.OTP_RESEND_SECONDS - (now - last.created_at).total_seconds()
        if wait > 0:
            n = math.ceil(wait)
            raise ApiError(
                429, f"Please wait {n} seconds before requesting a new code.",
                headers={"Retry-After": str(n)}, retry_after=n,
            )
        db.execute(
            update(OtpCode)
            .where(OtpCode.user_id == user.id, OtpCode.purpose == purpose, OtpCode.consumed_at.is_(None))
            .values(consumed_at=now)
        )
    code = f"{secrets.randbelow(10**6):06d}"
    db.add(OtpCode(user_id=user.id, purpose=purpose,
                   code_hash=_hash(code), expires_at=now + timedelta(minutes=s.OTP_EXPIRY_MINUTES),
                   created_at=now))
    db.commit()
    return code


def verify_otp(db: Session, user: User, purpose: str, code: str) -> None:
    """Consume the newest active code if `code` matches; otherwise raise a 4xx ApiError."""
    code = (code or "").strip()
    if not _CODE_RE.fullmatch(code):
        raise ApiError(422, "Enter the 6-digit code.", code="format")
    s = get_settings()
    otp = _newest(db, user, purpose, unconsumed_only=True)
    if otp is None:
        raise ApiError(400, "No active code. Request a new one.", code="none")
    now = utcnow()
    if otp.expires_at <= now:
        raise ApiError(400, "Code expired. Request a new one.", code="expired")
    if otp.attempts >= s.OTP_MAX_ATTEMPTS:
        raise ApiError(400, "Too many attempts. Request a new one.", code="locked")
    if not hmac.compare_digest(otp.code_hash, _hash(code)):
        otp.attempts += 1
        db.commit()
        raise ApiError(400, "Incorrect code.", code="invalid", attempts_left=max(0, s.OTP_MAX_ATTEMPTS - otp.attempts))
    otp.consumed_at = now
    db.commit()


def purge_old_otps(db: Session, older_than_hours: int = 24) -> int:
    res = db.execute(delete(OtpCode).where(OtpCode.created_at < utcnow() - timedelta(hours=older_than_hours)))
    db.commit()
    return res.rowcount or 0
