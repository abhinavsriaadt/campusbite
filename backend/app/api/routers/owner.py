"""Restaurant-owner endpoints: restaurant profile, menu management, partners, stats and reminders."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import case, func, select

from app.api.deps import DbSession, OwnerRestaurant, OwnerUser, PageParams
from app.api.routers.restaurants import _like, _menu_sort
from app.models import AdminReminderLog, MenuItem, Order, OrderStatus, User, UserRole
from app.schemas import (
    AvailabilityUpdate,
    DeliveryPartnerOut,
    MenuItemCreate,
    MenuItemOut,
    MenuItemUpdate,
    Page,
    ReminderOut,
    RestaurantOut,
    RestaurantStats,
    RestaurantUpdate,
)
from app.services.order_service import ACTIVE_STATUSES
from app.services.pagination import page_response, paginate
from app.services.reminder_service import generate_reminders
from app.services.stats_service import restaurant_stats
from app.core.database import utcnow

router = APIRouter(prefix="/owner", tags=["Restaurant Owner"])


# --------------------------------------------------------------------------- restaurant profile
@router.get("/restaurant", response_model=RestaurantOut)
def my_restaurant(restaurant: OwnerRestaurant):
    return restaurant


@router.patch("/restaurant", response_model=RestaurantOut)
def update_restaurant(data: RestaurantUpdate, restaurant: OwnerRestaurant, db: DbSession):
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "name" and v is None:
            continue
        setattr(restaurant, k, v)
    db.commit()
    db.refresh(restaurant)
    return restaurant


# --------------------------------------------------------------------------- menu management
def _get_own_item(db, restaurant, item_id: int) -> MenuItem:
    item = db.get(MenuItem, item_id)
    if item is None or item.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return item


@router.get("/menu-items", response_model=Page[MenuItemOut])
def list_menu_items(
    restaurant: OwnerRestaurant,
    db: DbSession,
    pg: PageParams,
    q: Annotated[str | None, Query(max_length=100)] = None,
    availability: Literal["all", "available", "unavailable"] = "all",
    category: Annotated[str | None, Query(max_length=80)] = None,
    sort: Literal["name", "price_asc", "price_desc", "newest"] = "name",
):
    stmt = select(MenuItem).where(MenuItem.restaurant_id == restaurant.id)
    if q:
        stmt = stmt.where(MenuItem.name.ilike(_like(q), escape="\\"))
    if availability != "all":
        stmt = stmt.where(MenuItem.is_available.is_(availability == "available"))
    if category:
        stmt = stmt.where(MenuItem.category == category)
    rows, total, pages = paginate(db, _menu_sort(stmt, sort), pg.page, pg.page_size)
    return page_response(rows, total, pg.page, pg.page_size, pages)


@router.post("/menu-items", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
def create_menu_item(data: MenuItemCreate, restaurant: OwnerRestaurant, db: DbSession):
    item = MenuItem(restaurant_id=restaurant.id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/menu-items/{item_id}", response_model=MenuItemOut)
def get_menu_item(item_id: int, restaurant: OwnerRestaurant, db: DbSession):
    return _get_own_item(db, restaurant, item_id)


@router.patch("/menu-items/{item_id}", response_model=MenuItemOut)
def update_menu_item(item_id: int, data: MenuItemUpdate, restaurant: OwnerRestaurant, db: DbSession):
    item = _get_own_item(db, restaurant, item_id)
    updates = data.model_dump(exclude_unset=True)
    for required in ("name", "price", "is_veg", "is_available"):
        if required in updates and updates[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} cannot be null")
    for k, v in updates.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/menu-items/{item_id}/availability", response_model=MenuItemOut)
def set_availability(item_id: int, data: AvailabilityUpdate, restaurant: OwnerRestaurant, db: DbSession):
    item = _get_own_item(db, restaurant, item_id)
    item.is_available = data.is_available
    db.commit()
    db.refresh(item)
    return item


@router.delete("/menu-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_menu_item(item_id: int, restaurant: OwnerRestaurant, db: DbSession):
    item = _get_own_item(db, restaurant, item_id)
    db.delete(item)  # order_items keep a snapshot; FK is SET NULL
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- delivery partners
@router.get("/delivery-partners", response_model=list[DeliveryPartnerOut])
def list_delivery_partners(_: OwnerUser, db: DbSession):
    active = func.coalesce(func.sum(case((Order.status.in_(ACTIVE_STATUSES), 1), else_=0)), 0)
    done = func.coalesce(func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)), 0)
    rows = db.execute(
        select(User.id, User.name, User.phone, active, done)
        .outerjoin(Order, Order.delivery_partner_id == User.id)
        .where(User.role == UserRole.DELIVERY_PARTNER, User.is_active.is_(True))
        .group_by(User.id, User.name, User.phone)
        .order_by(active.asc(), User.name.asc())
    ).all()
    return [
        DeliveryPartnerOut(id=i, name=n, phone=p, active_deliveries=int(a), completed_deliveries=int(d))
        for i, n, p, a, d in rows
    ]


# --------------------------------------------------------------------------- stats
@router.get("/stats", response_model=RestaurantStats)
def stats(restaurant: OwnerRestaurant, db: DbSession):
    return restaurant_stats(db, restaurant)


# --------------------------------------------------------------------------- reminders
@router.get("/reminders", response_model=Page[ReminderOut])
def list_reminders(
    restaurant: OwnerRestaurant,
    db: DbSession,
    pg: PageParams,
    include_resolved: bool = False,
):
    # Opportunistic refresh so the dashboard is current even between scheduler ticks.
    generate_reminders(db, restaurant_id=restaurant.id)
    stmt = select(AdminReminderLog).where(AdminReminderLog.restaurant_id == restaurant.id)
    if not include_resolved:
        stmt = stmt.where(AdminReminderLog.is_resolved.is_(False))
    stmt = stmt.order_by(AdminReminderLog.is_resolved.asc(), AdminReminderLog.created_at.desc())
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    return page_response(rows, total, pg.page, pg.page_size, pages)


@router.post("/reminders/{reminder_id}/dismiss", response_model=ReminderOut)
def dismiss_reminder(reminder_id: int, restaurant: OwnerRestaurant, db: DbSession):
    rem = db.get(AdminReminderLog, reminder_id)
    if rem is None or rem.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if not rem.is_resolved:
        rem.is_resolved = True
        rem.resolved_at = utcnow()
        db.commit()
        db.refresh(rem)
    return rem
