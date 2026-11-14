"""Authentication: email + password (bcrypt), JWT access tokens.

POST /auth/register → user created (and their restaurant, for owners) → JWT
POST /auth/login    → password checked → JWT
"""

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Restaurant, User, UserRole
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut, UserUpdate

router = APIRouter(prefix="/auth", tags=["Authentication"])

_DUPLICATE = "An account with this email already exists."


def user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    if user.role == UserRole.RESTAURANT_OWNER and user.restaurant is not None:
        out.restaurant_id = user.restaurant.id
    return out


def _token_response(user: User) -> TokenResponse:
    token, expires_in = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token, expires_in=expires_in, user=user_out(user))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED,
             responses={409: {"description": "Email already registered"}})
def register(data: RegisterRequest, db: DbSession):
    """Create an account (and, for owners, their restaurant) in one transaction and sign in."""
    if db.scalar(select(User.id).where(User.email == data.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE)

    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        phone=data.phone,
        address=data.address,
    )
    db.add(user)
    try:
        db.flush()
        if data.role == UserRole.RESTAURANT_OWNER and data.restaurant:
            db.add(Restaurant(owner_id=user.id, **data.restaurant.model_dump()))
        db.commit()
    except IntegrityError:  # a concurrent sign-up with the same email won the race
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE)
    db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse,
             responses={401: {"description": "Invalid email or password"}, 429: {"description": "Too many attempts"}})
def login(data: LoginRequest, db: DbSession, request: Request):
    settings = get_settings()
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = login_rate_limiter.hit(f"{client_ip}:{data.email}", settings.LOGIN_RATE_LIMIT)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in a few minutes.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.scalar(select(User).where(User.email == data.email))
    # verify_password runs bcrypt even when the user doesn't exist (timing equalisation)
    if not verify_password(data.password, user.password_hash if user else None) or user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")
    return _token_response(user)


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
