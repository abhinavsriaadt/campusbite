"""Restaurant statistics computed with SQL aggregates (no hardcoded numbers)."""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.timeutil import local_day_start, local_today, to_local_date
from app.models import (
    AdminReminderLog,
    LedgerEntryStatus,
    LedgerEntryType,
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    PaymentLedger,
    Restaurant,
    ReturnRequest,
    ReturnStatus,
)
from app.services.order_service import ACTIVE_STATUSES


def _f(v) -> float:
    return round(float(v or 0), 2)


def restaurant_stats(db: Session, restaurant: Restaurant) -> dict:
    rid = restaurant.id
    # Day boundaries follow the business timezone, not UTC.
    today = local_today()
    today_start = local_day_start(today)
    first_day = today - timedelta(days=6)
    week_start = local_day_start(first_day)

    by_status = dict(
        db.execute(select(Order.status, func.count()).where(Order.restaurant_id == rid).group_by(Order.status)).all()
    )
    orders_by_status = {s.value: int(by_status.get(s, 0)) for s in OrderStatus}
    total_orders = sum(orders_by_status.values())

    orders_today = db.scalar(
        select(func.count()).select_from(Order).where(Order.restaurant_id == rid, Order.created_at >= today_start)
    ) or 0

    ledger = db.execute(
        select(
            func.coalesce(func.sum(case((PaymentLedger.entry_type == LedgerEntryType.PAYMENT, PaymentLedger.amount))), 0),
            func.coalesce(func.sum(case((PaymentLedger.entry_type == LedgerEntryType.REFUND, PaymentLedger.amount))), 0),
        )
        .join(Order, Order.id == PaymentLedger.order_id)
        .where(Order.restaurant_id == rid, PaymentLedger.status == LedgerEntryStatus.SUCCESS)
    ).one()
    gross, refunded = _f(ledger[0]), _f(ledger[1])

    paid_orders = total_orders - orders_by_status["CANCELLED"] - orders_by_status["REFUNDED"]
    net = round(gross - refunded, 2)

    # Bucket by *local* calendar day in Python: portable across PostgreSQL/SQLite and
    # correct around midnight in non-UTC timezones. At most 7 days of one restaurant's orders.
    window_rows = db.execute(
        select(Order.created_at, Order.total_amount).where(
            Order.restaurant_id == rid,
            Order.created_at >= week_start,
            Order.status.not_in([OrderStatus.CANCELLED, OrderStatus.REFUNDED]),
        )
    ).all()
    buckets: dict = defaultdict(lambda: [0, 0.0])
    for created_at, amount in window_rows:
        b = buckets[to_local_date(created_at)]
        b[0] += 1
        b[1] += float(amount)
    revenue_last_7_days = []
    for i in range(7):
        d = first_day + timedelta(days=i)
        c, r = buckets.get(d, (0, 0.0))
        revenue_last_7_days.append({"date": d, "orders": c, "revenue": round(r, 2)})

    top_rows = db.execute(
        select(OrderItem.item_name, func.sum(OrderItem.quantity).label("qty"), func.sum(OrderItem.line_total))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.restaurant_id == rid, Order.status.not_in([OrderStatus.CANCELLED]))
        .group_by(OrderItem.item_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    ).all()

    pending_returns = db.scalar(
        select(func.count()).select_from(ReturnRequest).where(
            ReturnRequest.restaurant_id == rid, ReturnRequest.status == ReturnStatus.PENDING
        )
    ) or 0
    open_reminders = db.scalar(
        select(func.count()).select_from(AdminReminderLog).where(
            AdminReminderLog.restaurant_id == rid, AdminReminderLog.is_resolved.is_(False)
        )
    ) or 0
    menu_total, menu_available = db.execute(
        select(func.count(), func.coalesce(func.sum(case((MenuItem.is_available.is_(True), 1), else_=0)), 0)).where(
            MenuItem.restaurant_id == rid
        )
    ).one()

    return {
        "total_orders": total_orders,
        "orders_today": int(orders_today),
        "active_orders": sum(orders_by_status[s.value] for s in ACTIVE_STATUSES),
        "delivered_orders": orders_by_status["DELIVERED"],
        "cancelled_orders": orders_by_status["CANCELLED"],
        "refunded_orders": orders_by_status["REFUNDED"],
        "gross_revenue": gross,
        "net_revenue": net,
        "refunded_amount": refunded,
        "average_order_value": round(net / paid_orders, 2) if paid_orders > 0 else 0.0,
        "rating_avg": _f(restaurant.rating_avg),
        "rating_count": restaurant.rating_count,
        "pending_returns": int(pending_returns),
        "open_reminders": int(open_reminders),
        "menu_items_total": int(menu_total),
        "menu_items_available": int(menu_available),
        "orders_by_status": orders_by_status,
        "revenue_last_7_days": revenue_last_7_days,
        "top_items": [{"name": n, "quantity": int(q), "revenue": _f(r)} for n, q, r in top_rows],
    }
