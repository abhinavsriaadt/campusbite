"""Order domain logic: lifecycle state machine, placement, dummy payments, refunds and serialisation.

All business rules live here so that routers stay thin and every client (customer,
owner, delivery partner) goes through the same enforcement.
"""

import secrets
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import Select, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import get_settings
from app.core.database import utcnow
from app.core.timeutil import local_day_end, local_day_start
from app.models import (
    AdminReminderLog,
    LedgerEntryStatus,
    LedgerEntryType,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    PaymentLedger,
    PaymentStatus,
    Restaurant,
    ReturnStatus,
    User,
    UserRole,
)
from app.schemas import OrderCreate

S = OrderStatus
R = UserRole

# (from_status, to_status) -> roles that may perform the transition.
TRANSITIONS: dict[tuple[OrderStatus, OrderStatus], set[UserRole]] = {
    (S.PLACED, S.ACCEPTED): {R.RESTAURANT_OWNER},
    (S.PLACED, S.CANCELLED): {R.CUSTOMER, R.RESTAURANT_OWNER},
    (S.ACCEPTED, S.PREPARING): {R.RESTAURANT_OWNER},
    (S.PREPARING, S.READY): {R.RESTAURANT_OWNER},
    (S.READY, S.ASSIGNED): {R.RESTAURANT_OWNER},
    (S.ASSIGNED, S.OUT_FOR_DELIVERY): {R.DELIVERY_PARTNER},
    (S.OUT_FOR_DELIVERY, S.DELIVERED): {R.DELIVERY_PARTNER},
    (S.DELIVERED, S.REFUNDED): {R.RESTAURANT_OWNER},
}

# Targets reachable through the generic PATCH /status endpoint. ASSIGNED, CANCELLED
# and REFUNDED have dedicated endpoints because they carry extra data/side-effects.
GENERIC_STATUS_TARGETS = {S.ACCEPTED, S.PREPARING, S.READY, S.OUT_FOR_DELIVERY, S.DELIVERED}

ACTIVE_STATUSES = {S.PLACED, S.ACCEPTED, S.PREPARING, S.READY, S.ASSIGNED, S.OUT_FOR_DELIVERY}
REVIEWABLE_STATUSES = {S.DELIVERED, S.REFUNDED}

CENT = Decimal("0.01")


def money(v) -> Decimal:
    return Decimal(str(v)).quantize(CENT, rounding=ROUND_HALF_UP)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")


def _conflict(detail: str) -> HTTPException:
    """409: the request clashes with existing state (duplicate, closed restaurant, sold out)."""
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    """400: a business rule forbids this action in the order's current status."""
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


# --------------------------------------------------------------------------- queries & access
def order_load_options():
    return (
        joinedload(Order.restaurant),
        joinedload(Order.customer),
        joinedload(Order.delivery_partner),
        selectinload(Order.items),
        selectinload(Order.payments),
        selectinload(Order.status_history),
        joinedload(Order.review),
        joinedload(Order.return_request),
    )


def scope_orders_for_user(stmt: Select, user: User) -> Select:
    """Restrict an Order query to what this user is allowed to see."""
    if user.role == R.CUSTOMER:
        return stmt.where(Order.customer_id == user.id)
    if user.role == R.RESTAURANT_OWNER:
        return stmt.join(Restaurant, Restaurant.id == Order.restaurant_id).where(Restaurant.owner_id == user.id)
    if user.role == R.DELIVERY_PARTNER:
        return stmt.where(Order.delivery_partner_id == user.id)
    return stmt.where(False)


def get_order_for_user(db: Session, order_id: int, user: User, *, lock: bool = False) -> Order:
    """Fetch an order the user may access. Returns 404 for both missing and foreign orders
    so order IDs belonging to other users cannot be probed."""
    if lock:
        # Lock the bare row first (FOR UPDATE cannot be combined with outer joins on PostgreSQL).
        locked_id = db.scalar(
            scope_orders_for_user(select(Order.id), user).where(Order.id == order_id).with_for_update(of=Order)
        )
        if locked_id is None:
            raise _not_found()
    stmt = scope_orders_for_user(select(Order), user).where(Order.id == order_id).options(*order_load_options())
    order = db.scalars(stmt).unique().first()
    if order is None:
        raise _not_found()
    return order


def apply_order_filters(
    stmt: Select,
    *,
    statuses: list[OrderStatus] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Select:
    if statuses:
        stmt = stmt.where(Order.status.in_(statuses))
    if date_from:
        stmt = stmt.where(Order.created_at >= local_day_start(date_from))
    if date_to:
        stmt = stmt.where(Order.created_at < local_day_end(date_to))
    return stmt


def parse_statuses(raw: str | None) -> list[OrderStatus] | None:
    if not raw:
        return None
    out = []
    for part in raw.split(","):
        part = part.strip().upper()
        if not part:
            continue
        try:
            out.append(OrderStatus(part))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid order status filter: {part}") from None
    return out or None


# --------------------------------------------------------------------------- state machine
def ensure_transition(order: Order, target: OrderStatus, user: User) -> None:
    allowed_roles = TRANSITIONS.get((order.status, target))
    if allowed_roles is None:
        raise _bad_request(f"Invalid status transition: {order.status.value} → {target.value}")
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role cannot move an order from {order.status.value} to {target.value}",
        )


def _set_status(db: Session, order: Order, target: OrderStatus, user: User | None, note: str | None = None) -> None:
    previous = order.status
    now = utcnow()
    order.status = target
    order.status_updated_at = now
    if target == S.DELIVERED:
        order.delivered_at = now
    db.add(
        OrderStatusHistory(
            order_id=order.id, from_status=previous, to_status=target, changed_by_id=user.id if user else None, note=note
        )
    )
    # Any open reminder for this order is now stale.
    db.execute(
        update(AdminReminderLog)
        .where(AdminReminderLog.order_id == order.id, AdminReminderLog.is_resolved.is_(False))
        .values(is_resolved=True, resolved_at=now)
    )


def transition(db: Session, order: Order, target: OrderStatus, user: User, note: str | None = None) -> Order:
    ensure_transition(order, target, user)
    _set_status(db, order, target, user, note)
    return order


def allowed_actions(order: Order, user: User) -> list[str]:
    """Actions the UI may offer this user for this order (the backend re-validates each one)."""
    actions: list[str] = []
    for (src, dst), roles in TRANSITIONS.items():
        if src == order.status and user.role in roles:
            if dst == S.CANCELLED:
                actions.append("cancel")
            elif dst == S.ASSIGNED:
                actions.append("assign")
            elif dst == S.REFUNDED:
                continue
            else:
                actions.append(dst.value)
    if user.role == R.RESTAURANT_OWNER and order.status == S.ASSIGNED:
        actions.append("reassign")
    if user.role == R.CUSTOMER and order.status in REVIEWABLE_STATUSES and order.review is None:
        actions.append("review")
    if user.role == R.CUSTOMER and order.status == S.DELIVERED and order.return_request is None:
        actions.append("request_return")
    if (
        user.role == R.RESTAURANT_OWNER
        and order.return_request is not None
        and order.return_request.status == ReturnStatus.PENDING
    ):
        actions.append("resolve_return")
    return actions


# --------------------------------------------------------------------------- payments
def _txn_ref(prefix: str) -> str:
    return f"{prefix}-{utcnow():%Y%m%d}-{secrets.token_hex(6).upper()}"


def record_dummy_payment(db: Session, order: Order) -> PaymentLedger:
    """Dummy gateway: always succeeds, never touches real payment data."""
    entry = PaymentLedger(
        order_id=order.id,
        entry_type=LedgerEntryType.PAYMENT,
        status=LedgerEntryStatus.SUCCESS,
        amount=order.total_amount,
        method=order.payment_method,
        transaction_ref=_txn_ref("MOCKPAY"),
        note="Dummy payment captured (no real gateway)",
    )
    db.add(entry)
    order.payment_status = PaymentStatus.MOCK_PAID
    return entry


def record_refund(db: Session, order: Order, note: str) -> PaymentLedger | None:
    if order.payment_status != PaymentStatus.MOCK_PAID:
        return None
    entry = PaymentLedger(
        order_id=order.id,
        entry_type=LedgerEntryType.REFUND,
        status=LedgerEntryStatus.SUCCESS,
        amount=order.total_amount,
        method=order.payment_method,
        transaction_ref=_txn_ref("MOCKREF"),
        note=note,
    )
    db.add(entry)
    order.payment_status = PaymentStatus.REFUNDED
    return entry


# --------------------------------------------------------------------------- commands
def price_items(db: Session, restaurant_id: int, items) -> dict:
    """Validate a basket and price it from the database. Shared by quote and place_order."""
    settings = get_settings()

    restaurant = db.get(Restaurant, restaurant_id)
    if restaurant is None:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if not restaurant.is_open:
        raise _conflict("This restaurant is currently not accepting orders")

    # Merge duplicate lines.
    quantities: dict[int, int] = {}
    for line in items:
        quantities[line.menu_item_id] = quantities.get(line.menu_item_id, 0) + line.quantity
    if any(q > 50 for q in quantities.values()):
        raise HTTPException(status_code=422, detail="Maximum quantity per dish is 50")

    menu_items = {
        m.id: m for m in db.scalars(select(MenuItem).where(MenuItem.id.in_(quantities.keys())))
    }
    missing = [i for i in quantities if i not in menu_items]
    if missing:
        raise HTTPException(status_code=422, detail=f"Some dishes no longer exist on the menu (ids {missing})")
    if any(m.restaurant_id != restaurant.id for m in menu_items.values()):
        raise HTTPException(status_code=422, detail="All items in an order must come from the same restaurant")
    unavailable = [m.name for m in menu_items.values() if not m.is_available]
    if unavailable:
        raise _conflict(f"Currently unavailable: {', '.join(unavailable)}")

    # Prices are always computed server-side from the database.
    subtotal = Decimal("0")
    lines = []
    for item_id, qty in quantities.items():
        m = menu_items[item_id]
        line_total = money(m.price * qty)
        subtotal += line_total
        lines.append({"menu_item_id": m.id, "item_name": m.name, "unit_price": money(m.price),
                      "quantity": qty, "line_total": line_total})
    subtotal = money(subtotal)
    delivery_fee = money(settings.DELIVERY_FEE)
    tax = money(subtotal * Decimal(str(settings.TAX_RATE)))
    return {
        "restaurant": restaurant,
        "lines": lines,
        "subtotal": subtotal,
        "delivery_fee": delivery_fee,
        "tax": tax,
        "total": money(subtotal + delivery_fee + tax),
    }


def place_order(db: Session, customer: User, data: OrderCreate) -> Order:
    priced = price_items(db, data.restaurant_id, data.items)
    restaurant = priced["restaurant"]
    subtotal, delivery_fee, tax, total = priced["subtotal"], priced["delivery_fee"], priced["tax"], priced["total"]
    lines = [OrderItem(**line) for line in priced["lines"]]

    now = utcnow()
    order = Order(
        customer_id=customer.id,
        restaurant_id=restaurant.id,
        status=S.PLACED,
        payment_status=PaymentStatus.PENDING,
        payment_method=data.payment_method,
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        tax=tax,
        total_amount=total,
        delivery_address=data.delivery_address,
        contact_phone=data.contact_phone or customer.phone,
        notes=data.notes,
        created_at=now,
        status_updated_at=now,
        items=lines,
    )
    db.add(order)
    db.flush()
    db.add(OrderStatusHistory(order_id=order.id, from_status=None, to_status=S.PLACED, changed_by_id=customer.id))
    record_dummy_payment(db, order)
    db.commit()
    return order


def cancel_order(db: Session, order: Order, user: User, reason: str | None) -> Order:
    if order.status == S.DELIVERED:
        raise _bad_request("Delivered orders cannot be cancelled")
    if order.status != S.PLACED:
        raise _bad_request("Orders can only be cancelled while they are in PLACED status")
    ensure_transition(order, S.CANCELLED, user)
    by = "customer" if user.role == R.CUSTOMER else "restaurant"
    order.cancel_reason = reason or f"Cancelled by {by}"
    _set_status(db, order, S.CANCELLED, user, order.cancel_reason)
    record_refund(db, order, f"Automatic refund — order cancelled by {by}")
    db.commit()
    return order


def assign_partner(db: Session, order: Order, owner: User, partner_id: int) -> Order:
    partner = db.get(User, partner_id)
    if partner is None or partner.role != R.DELIVERY_PARTNER or not partner.is_active:
        raise HTTPException(status_code=422, detail="Selected user is not an active delivery partner")
    if order.status == S.ASSIGNED:
        # Re-assignment before pickup.
        if order.delivery_partner_id == partner.id:
            raise _conflict("Order is already assigned to this delivery partner")
        previous = order.delivery_partner.name if order.delivery_partner else "unknown"
        order.delivery_partner_id = partner.id
        db.add(
            OrderStatusHistory(
                order_id=order.id,
                from_status=S.ASSIGNED,
                to_status=S.ASSIGNED,
                changed_by_id=owner.id,
                note=f"Reassigned from {previous} to {partner.name}",
            )
        )
        order.status_updated_at = utcnow()
    else:
        if order.status != S.READY:
            raise _bad_request("Delivery partners can only be assigned when the order is READY")
        ensure_transition(order, S.ASSIGNED, owner)
        order.delivery_partner_id = partner.id
        _set_status(db, order, S.ASSIGNED, owner, f"Assigned to {partner.name}")
    db.commit()
    return order


# --------------------------------------------------------------------------- serialisation
def _person(u, include_phone=True) -> dict | None:
    if u is None:
        return None
    return {"id": u.id, "name": u.name, "phone": u.phone if include_phone else None}


def serialize_summary(order: Order, viewer: User) -> dict:
    return {
        "id": order.id,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "total_amount": order.total_amount,
        "item_count": sum(i.quantity for i in order.items),
        # Read-only preview for list views (Kanban cards, order rows). Same snapshot as the detail view.
        "items_preview": [{"name": i.item_name, "quantity": i.quantity} for i in order.items],
        "restaurant": {
            "id": order.restaurant.id, "name": order.restaurant.name,
            "phone": order.restaurant.phone, "image_url": order.restaurant.image_url,
        },
        "customer": _person(order.customer),
        "delivery_partner": _person(order.delivery_partner),
        "delivery_address": order.delivery_address,
        "contact_phone": order.contact_phone,
        "delivered_at": order.delivered_at,
        "created_at": order.created_at,
        "status_updated_at": order.status_updated_at,
        "return_status": order.return_request.status if order.return_request else None,
        "has_review": order.review is not None,
        "allowed_actions": allowed_actions(order, viewer),
    }


def serialize_order(order: Order, viewer: User) -> dict:
    data = serialize_summary(order, viewer)
    data.update(
        {
            "subtotal": order.subtotal,
            "delivery_fee": order.delivery_fee,
            "tax": order.tax,
            "notes": order.notes,
            "cancel_reason": order.cancel_reason,
            "items": order.items,
            # Delivery partners don't need to see payment ledger internals.
            "payments": [] if viewer.role == R.DELIVERY_PARTNER else order.payments,
            "status_history": order.status_history,
            "return_request": order.return_request,
            "review": order.review,
        }
    )
    return data


def reload(db: Session, order_id: int, user: User) -> Order:
    db.expire_all()
    return get_order_for_user(db, order_id, user)

