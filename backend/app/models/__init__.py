"""SQLAlchemy ORM models for CampusBite."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime, utcnow
from app.models.enums import (
    LedgerEntryStatus,
    LedgerEntryType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    ReturnStatus,
    UserRole,
    enum_values,
)

Money = Numeric(10, 2)


def _enum(cls, name: str | None = None):
    return SAEnum(
        cls, native_enum=False, length=32, values_callable=enum_values, validate_strings=True,
        create_constraint=True, name=name or cls.__name__.lower(),
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(_enum(UserRole), index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Set once the signup email OTP is verified; unverified users cannot use any protected API.
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)

    restaurant: Mapped["Restaurant | None"] = relationship(back_populates="owner", uselist=False)
    orders: Mapped[list["Order"]] = relationship(
        back_populates="customer", foreign_keys="Order.customer_id"
    )
    deliveries: Mapped[list["Order"]] = relationship(
        back_populates="delivery_partner", foreign_keys="Order.delivery_partner_id"
    )


class OtpCode(TimestampMixin, Base):
    """One-time email code. Only a keyed SHA-256 hash of the code is stored."""

    __tablename__ = "otp_codes"
    __table_args__ = (
        CheckConstraint("purpose IN ('signup', 'login')", name="purpose_valid"),
        Index("ix_otp_codes_user_purpose_created", "user_id", "purpose", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose: Mapped[str] = mapped_column(String(16), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Category(Base):
    """Browse category (North Indian, Rolls, Coffee, ...). A restaurant can be in several."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))


restaurant_categories = Table(
    "restaurant_categories",
    Base.metadata,
    Column("restaurant_id", ForeignKey("restaurants.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True, index=True),
)

# Category slugs on a dish. JSONB on PostgreSQL, JSON elsewhere (tests use SQLite).
Tags = JSON().with_variant(JSONB(), "postgresql")


class Restaurant(TimestampMixin, Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    cuisine: Mapped[str | None] = mapped_column(String(100), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(20))
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rating_avg: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_for_two: Mapped[int | None] = mapped_column(Integer)
    primary_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))

    owner: Mapped[User] = relationship(back_populates="restaurant")
    primary_category: Mapped[Category | None] = relationship()
    categories: Mapped[list[Category]] = relationship(secondary=restaurant_categories, order_by=Category.id)
    menu_items: Mapped[list["MenuItem"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="restaurant")


class MenuItem(TimestampMixin, Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint("price > 0", name="price_positive"),
        Index("ix_menu_items_restaurant_name", "restaurant_id", "name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    category: Mapped[str | None] = mapped_column(String(80), index=True)
    is_veg: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tags: Mapped[list[str]] = mapped_column(Tags, default=list, server_default="[]", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)

    restaurant: Mapped[Restaurant] = relationship(back_populates="menu_items")


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_restaurant_status", "restaurant_id", "status"),
        Index("ix_orders_customer_created", "customer_id", "created_at"),
        Index("ix_orders_partner_status", "delivery_partner_id", "status"),
        Index("ix_orders_status_updated", "status", "status_updated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="RESTRICT"), nullable=False)
    delivery_partner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus), default=OrderStatus.PLACED, nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        _enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(_enum(PaymentMethod), nullable=False)

    subtotal: Mapped[Decimal] = mapped_column(Money, nullable=False)
    delivery_fee: Mapped[Decimal] = mapped_column(Money, nullable=False)
    tax: Mapped[Decimal] = mapped_column(Money, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)

    delivery_address: Mapped[str] = mapped_column(Text, nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)
    status_updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    customer: Mapped[User] = relationship(back_populates="orders", foreign_keys=[customer_id])
    delivery_partner: Mapped[User | None] = relationship(
        back_populates="deliveries", foreign_keys=[delivery_partner_id]
    )
    restaurant: Mapped[Restaurant] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
    payments: Mapped[list["PaymentLedger"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="PaymentLedger.id"
    )
    review: Mapped["Review | None"] = relationship(back_populates="order", uselist=False)
    return_request: Mapped["ReturnRequest | None"] = relationship(back_populates="order", uselist=False)
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderStatusHistory.id"
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    # Nullable so historical orders survive menu item deletion; name/price are snapshotted.
    menu_item_id: Mapped[int | None] = mapped_column(ForeignKey("menu_items.id", ondelete="SET NULL"), index=True)
    item_name: Mapped[str] = mapped_column(String(150), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Money, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusHistory(TimestampMixin, Base):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    from_status: Mapped[OrderStatus | None] = mapped_column(_enum(OrderStatus, "from_status"))
    to_status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus, "to_status"), nullable=False)
    changed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="status_history")


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="review")
    customer: Mapped[User] = relationship()


class PaymentLedger(TimestampMixin, Base):
    __tablename__ = "payment_ledger"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    entry_type: Mapped[LedgerEntryType] = mapped_column(_enum(LedgerEntryType), nullable=False)
    status: Mapped[LedgerEntryStatus] = mapped_column(_enum(LedgerEntryStatus), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(_enum(PaymentMethod), nullable=False)
    transaction_ref: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="payments")


class ReturnRequest(TimestampMixin, Base):
    __tablename__ = "return_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    # unique => a customer cannot submit multiple return requests for the same order
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ReturnStatus] = mapped_column(_enum(ReturnStatus), default=ReturnStatus.PENDING, nullable=False)
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    order: Mapped[Order] = relationship(back_populates="return_request")
    customer: Mapped[User] = relationship(foreign_keys=[customer_id])


class AdminReminderLog(TimestampMixin, Base):
    __tablename__ = "admin_reminder_logs"
    __table_args__ = (
        Index("ix_reminders_restaurant_resolved", "restaurant_id", "is_resolved"),
        # At most one reminder per (order, status) — guards against concurrent scheduler runs.
        UniqueConstraint("order_id", "order_status", name="uq_admin_reminder_logs_order_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    order_status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    minutes_pending: Mapped[int] = mapped_column(Integer, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    order: Mapped[Order] = relationship()


__all__ = [
    "OtpCode",
    "Category",
    "restaurant_categories",
    "Base",
    "User",
    "Restaurant",
    "MenuItem",
    "Order",
    "OrderItem",
    "OrderStatusHistory",
    "Review",
    "PaymentLedger",
    "ReturnRequest",
    "AdminReminderLog",
    "UserRole",
    "OrderStatus",
    "PaymentStatus",
    "PaymentMethod",
    "LedgerEntryType",
    "LedgerEntryStatus",
    "ReturnStatus",
]
