"""Authentication: bcrypt password + email OTP.

Sign-up:  POST /auth/register  -> code emailed -> POST /auth/verify-email -> token
Log in:   POST /auth/login     -> code emailed -> POST /auth/login/verify   -> token
          (with OTP_ON_LOGIN=false, /auth/login returns the token directly)
No token is ever issued to an unverified account, and get_current_user rejects them.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import auth_rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Restaurant, User, UserRole
from app.schemas import (
    ResendOut,
    LoginRequest,
    OtpChallenge,
    RegisterRequest,
    ResendRequest,
    TokenResponse,
    UserOut,
    UserUpdate,
    VerifyCodeRequest,
)
from app.services import mailer
from app.services.otp import issue_otp, verify_otp

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("campusbite.auth")

_RESEND_MESSAGE = "If the account exists, a new code has been sent."
_BAD_CODE_RESPONSES = {400: {"description": "Wrong, expired or locked code ({detail, code, attempts_left?})"},
                       429: {"description": "Rate limited / resend cooldown (Retry-After header)"}}


def user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    if user.role == UserRole.RESTAURANT_OWNER and user.restaurant is not None:
        out.restaurant_id = user.restaurant.id
    return out


def _token_response(user: User) -> TokenResponse:
    token, expires_in = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token, expires_in=expires_in, user=user_out(user))


def mask_email(email: str) -> str:
    """a***h@gmail.com — enough for the user to recognise, not enough to harvest."""
    local, _, domain = email.partition("@")
    masked = f"{local[0]}***{local[-1]}" if len(local) > 1 else f"{local}***"
    return f"{masked}@{domain}"


def _rate_limit(request: Request, endpoint: str, email: str) -> None:
    s = get_settings()
    ip = request.client.host if request.client else "unknown"
    allowed, retry_after = auth_rate_limiter.hit(f"{endpoint}:{ip}:{email}", s.AUTH_RATE_LIMIT)
    if not allowed:
        raise ApiError(429, "Too many attempts. Try again in a few minutes.",
                       headers={"Retry-After": str(retry_after)}, retry_after=retry_after)


def _send_code(db, bg: BackgroundTasks, user: User, purpose: str, *, quiet_cooldown: bool = False) -> int:
    """Issue a code and schedule its delivery; returns seconds until a resend is allowed.
    With quiet_cooldown, a code sent in the last OTP_RESEND_SECONDS is reused silently (the
    user is asked for the code they already have)."""
    try:
        code = issue_otp(db, user, purpose)
    except ApiError as e:
        if quiet_cooldown and e.status_code == 429:
            return int(e.body["retry_after"])
        raise
    bg.add_task(mailer.deliver_otp, user.email, user.name, purpose, code)
    return get_settings().OTP_RESEND_SECONDS


def _user_by_email(db, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


@router.post(
    "/register", response_model=OtpChallenge, status_code=status.HTTP_201_CREATED,
    responses={200: {"model": OtpChallenge, "description": "Unverified account re-registered; new code sent"},
               409: {"description": "Verified account already exists"}, 429: {"description": "Resend cooldown"}},
)
def register(data: RegisterRequest, db: DbSession, bg: BackgroundTasks, response: Response):
    """Create an account and email a signup code. Never returns a token."""
    existing = _user_by_email(db, data.email)
    if existing is not None and existing.is_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="An account with this email already exists. Log in instead.")

    if existing is not None:
        # Unverified: nobody has proven they own this address yet, so the latest sign-up wins.
        user = existing
        user.name, user.role, user.phone, user.address = data.name, data.role, data.phone, data.address
        user.password_hash = hash_password(data.password)
        if data.role == UserRole.RESTAURANT_OWNER and data.restaurant:
            fields = data.restaurant.model_dump()
            if user.restaurant is not None:
                for k, v in fields.items():
                    setattr(user.restaurant, k, v)
            else:
                db.add(Restaurant(owner_id=user.id, **fields))
        elif user.restaurant is not None:
            db.delete(user.restaurant)
        response.status_code = status.HTTP_200_OK
    else:
        user = User(name=data.name, email=data.email, password_hash=hash_password(data.password),
                    role=data.role, phone=data.phone, address=data.address, is_verified=False)
        db.add(user)
        try:
            db.flush()
            if data.role == UserRole.RESTAURANT_OWNER and data.restaurant:
                db.add(Restaurant(owner_id=user.id, **data.restaurant.model_dump()))
                db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="An account with this email already exists. Log in instead.")

    # issue_otp commits the user, restaurant and code together (one transaction). During the
    # resend cooldown it raises 429 and the request's session is rolled back.
    wait = _send_code(db, bg, user, "signup")
    return OtpChallenge(status="verification_required", email=mask_email(user.email), purpose="signup", resend_in=wait)


@router.post("/verify-email", response_model=TokenResponse, responses=_BAD_CODE_RESPONSES)
def verify_email(data: VerifyCodeRequest, db: DbSession, request: Request):
    """Verify the signup code, mark the account verified and log in."""
    _rate_limit(request, "verify-email", data.email)
    user = _user_by_email(db, data.email)
    if user is None or user.is_verified:
        raise ApiError(400, "No active code. Request a new one.", code="none")
    verify_otp(db, user, "signup", data.code)
    user.is_verified = True
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post(
    "/login", response_model=TokenResponse | OtpChallenge,
    responses={401: {"description": "Invalid email or password"},
               403: {"model": OtpChallenge, "description": "Email not verified yet; signup code sent"},
               429: {"description": "Too many attempts"}},
)
def login(data: LoginRequest, db: DbSession, request: Request, bg: BackgroundTasks):
    """Check the password; then email a login code (OTP_ON_LOGIN=true) or return the token."""
    _rate_limit(request, "login", data.email)
    user = _user_by_email(db, data.email)
    # verify_password runs bcrypt even when the user doesn't exist (timing equalisation)
    if not verify_password(data.password, user.password_hash if user else None) or user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")

    if not user.is_verified:
        wait = _send_code(db, bg, user, "signup", quiet_cooldown=True)
        body = OtpChallenge(status="verification_required", email=mask_email(user.email), purpose="signup",
                            resend_in=wait, detail="Please verify your email to continue.")
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content=body.model_dump(), background=bg)

    if get_settings().OTP_ON_LOGIN:
        wait = _send_code(db, bg, user, "login", quiet_cooldown=True)
        return OtpChallenge(status="otp_required", email=mask_email(user.email), purpose="login", resend_in=wait)
    return _token_response(user)


@router.post("/login/verify", response_model=TokenResponse, responses=_BAD_CODE_RESPONSES)
def login_verify(data: VerifyCodeRequest, db: DbSession, request: Request):
    """Verify the login code and return the access token."""
    _rate_limit(request, "login-verify", data.email)
    user = _user_by_email(db, data.email)
    if user is None or not user.is_verified or not user.is_active:
        raise ApiError(400, "No active code. Request a new one.", code="none")
    verify_otp(db, user, "login", data.code)
    return _token_response(user)


@router.post("/otp/resend", response_model=ResendOut, responses={429: {"description": "Cooldown (Retry-After)"}})
def resend_otp(data: ResendRequest, db: DbSession, request: Request, bg: BackgroundTasks):
    """Send a fresh code. The reply is the same whether or not the account exists."""
    _rate_limit(request, "resend", data.email)
    user = _user_by_email(db, data.email)
    eligible = user is not None and user.is_active and (
        (data.purpose == "signup" and not user.is_verified) or (data.purpose == "login" and user.is_verified)
    )
    if eligible:
        _send_code(db, bg, user, data.purpose)
    return ResendOut(detail=_RESEND_MESSAGE, resend_in=get_settings().OTP_RESEND_SECONDS)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: CurrentUser, db: DbSession):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user_out(user)
