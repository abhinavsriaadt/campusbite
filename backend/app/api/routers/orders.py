"""Order placement, history, details and lifecycle management (role-aware)."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, CustomerUser, DbSession, OwnerUser, PageParams
from app.models import Order, Restaurant, ReturnRequest, Review, UserRole
from app.schemas import (
    AssignRequest,
    CancelRequest,
    OrderCreate,
    OrderOut,
    OrderSummaryOut,
    Page,
    PaymentOut,
    QuoteOut,
    QuoteRequest,
    ReturnCreate,
    ReviewCreate,
    StatusUpdate,
)
from app.services import order_service as svc
from app.services.pagination import page_response, paginate

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("/quote", response_model=QuoteOut)
def quote(data: QuoteRequest, _: CustomerUser, db: DbSession):
    """Server-side price preview for a basket (same validation and pricing as placing the order)."""
    priced = svc.price_items(db, data.restaurant_id, data.items)
    return {**priced, "restaurant_id": priced["restaurant"].id}


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def place_order(data: OrderCreate, customer: CustomerUser, db: DbSession):
    """Place an order. Prices are computed server-side and a dummy payment is captured
    immediately, setting payment_status to `mock_paid`."""
    order = svc.place_order(db, customer, data)
    return svc.serialize_order(svc.reload(db, order.id, customer), customer)


@router.get("", response_model=Page[OrderSummaryOut])
def list_orders(
    user: CurrentUser,
    db: DbSession,
    pg: PageParams,
    status_: Annotated[
        str | None, Query(alias="status", description="Comma-separated statuses, e.g. PLACED,ACCEPTED")
    ] = None,
    scope: Annotated[
        Literal["all", "active", "history"], Query(description="active = in progress, history = finished")
    ] = "all",
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal["newest", "oldest"] = "newest",
):
    """Customers see their own orders, owners see their restaurant's orders and delivery
    partners see only orders assigned to them."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from cannot be after date_to")
    statuses = svc.parse_statuses(status_)
    stmt = svc.scope_orders_for_user(select(Order), user).options(*svc.order_load_options())
    stmt = svc.apply_order_filters(stmt, statuses=statuses, date_from=date_from, date_to=date_to)
    if scope == "active":
        stmt = stmt.where(Order.status.in_(svc.ACTIVE_STATUSES))
    elif scope == "history":
        stmt = stmt.where(Order.status.not_in(svc.ACTIVE_STATUSES))
    stmt = stmt.order_by(Order.created_at.desc() if sort == "newest" else Order.created_at.asc(), Order.id.desc())
    rows, total, pages = paginate(db, stmt, pg.page, pg.page_size)
    return page_response([svc.serialize_summary(o, user) for o in rows], total, pg.page, pg.page_size, pages)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, user: CurrentUser, db: DbSession):
    return svc.serialize_order(svc.get_order_for_user(db, order_id, user), user)


@router.get("/{order_id}/payments", response_model=list[PaymentOut])
def order_payments(order_id: int, user: CurrentUser, db: DbSession):
    if user.role == UserRole.DELIVERY_PARTNER:
        raise HTTPException(status_code=403, detail="Delivery partners cannot view payment records")
    return svc.get_order_for_user(db, order_id, user).payments


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_status(order_id: int, data: StatusUpdate, user: CurrentUser, db: DbSession):
    """Owners: PLACED→ACCEPTED→PREPARING→READY. Delivery partners: ASSIGNED→OUT_FOR_DELIVERY→DELIVERED.
    Use the dedicated endpoints for cancel / assign / refunds."""
    if data.status not in svc.GENERIC_STATUS_TARGETS:
        raise HTTPException(
            status_code=422,
            detail=f"Status {data.status.value} cannot be set directly; use the cancel, assign or return endpoints",
        )
    order = svc.get_order_for_user(db, order_id, user, lock=True)
    svc.transition(db, order, data.status, user, data.note)
    db.commit()
    return svc.serialize_order(svc.reload(db, order_id, user), user)


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel(order_id: int, data: CancelRequest, user: CurrentUser, db: DbSession):
    if user.role == UserRole.DELIVERY_PARTNER:
        raise HTTPException(status_code=403, detail="Delivery partners cannot cancel orders")
    order = svc.get_order_for_user(db, order_id, user, lock=True)
    svc.cancel_order(db, order, user, data.reason)
    return svc.serialize_order(svc.reload(db, order_id, user), user)


@router.post("/{order_id}/assign", response_model=OrderOut)
def assign(order_id: int, data: AssignRequest, owner: OwnerUser, db: DbSession):
    order = svc.get_order_for_user(db, order_id, owner, lock=True)
    svc.assign_partner(db, order, owner, data.delivery_partner_id)
    return svc.serialize_order(svc.reload(db, order_id, owner), owner)


@router.post("/{order_id}/review", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def review_order(order_id: int, data: ReviewCreate, customer: CustomerUser, db: DbSession):
    order = svc.get_order_for_user(db, order_id, customer, lock=True)
    if order.status not in svc.REVIEWABLE_STATUSES:
        raise HTTPException(status_code=409, detail="You can only review an order after it has been delivered")
    if order.review is not None:
        raise HTTPException(status_code=409, detail="You have already reviewed this order")

    restaurant = db.scalar(select(Restaurant).where(Restaurant.id == order.restaurant_id).with_for_update())
    db.add(Review(order_id=order.id, customer_id=customer.id, restaurant_id=restaurant.id,
                  rating=data.rating, comment=data.comment))
    # Maintain denormalised rating (incremental mean).
    n = restaurant.rating_count
    restaurant.rating_avg = round((float(restaurant.rating_avg) * n + data.rating) / (n + 1), 2)
    restaurant.rating_count = n + 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="You have already reviewed this order") from None
    return svc.serialize_order(svc.reload(db, order_id, customer), customer)


@router.post("/{order_id}/return", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def request_return(order_id: int, data: ReturnCreate, customer: CustomerUser, db: DbSession):
    order = svc.get_order_for_user(db, order_id, customer, lock=True)
    if order.return_request is not None:
        raise HTTPException(status_code=409, detail="A return/refund request already exists for this order")
    if order.status != svc.S.DELIVERED:
        raise HTTPException(status_code=409, detail="Returns can only be requested after the order has been delivered")
    db.add(ReturnRequest(order_id=order.id, customer_id=customer.id, restaurant_id=order.restaurant_id,
                         reason=data.reason))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A return/refund request already exists for this order") from None
    return svc.serialize_order(svc.reload(db, order_id, customer), customer)
