"""Shared FastAPI dependencies: DB session, authentication and role-based authorisation."""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import Restaurant, User, UserRole

DbSession = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False, description="JWT access token from /api/auth/login")

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _CREDENTIALS_ERROR
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _CREDENTIALS_ERROR from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _CREDENTIALS_ERROR
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole):
    def _checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _checker


CustomerUser = Annotated[User, Depends(require_roles(UserRole.CUSTOMER))]
OwnerUser = Annotated[User, Depends(require_roles(UserRole.RESTAURANT_OWNER))]
PartnerUser = Annotated[User, Depends(require_roles(UserRole.DELIVERY_PARTNER))]


def get_owner_restaurant(db: DbSession, owner: OwnerUser) -> Restaurant:
    restaurant = db.scalar(select(Restaurant).where(Restaurant.owner_id == owner.id))
    if restaurant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No restaurant linked to this account")
    return restaurant


OwnerRestaurant = Annotated[Restaurant, Depends(get_owner_restaurant)]


class Pagination:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1, le=10_000)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


PageParams = Annotated[Pagination, Depends()]
