"""Pydantic request/response schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator, model_validator

from app.models.enums import (
    LedgerEntryStatus,
    LedgerEntryType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    ReturnStatus,
    UserRole,
)

T = TypeVar("T")

# Serialise Decimals as JSON numbers (Pydantic v2 defaults to strings).
MoneyOut = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]
PriceIn = Annotated[Decimal, Field(gt=0, le=100000, max_digits=10, decimal_places=2)]


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Message(BaseModel):
    message: str


# --------------------------------------------------------------------------- auth
Password = Annotated[str, Field(min_length=8, max_length=72)]


def _norm_email(v):
    """Emails are stored and compared trimmed + lowercased on every input."""
    return v.strip().lower() if isinstance(v, str) else v


class RestaurantCreateInline(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    cuisine: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=20)
    image_url: str | None = Field(default=None, max_length=500)

    _s = field_validator("name", "description", "cuisine", "address", "phone", "image_url", mode="before")(_strip)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: Password
    role: UserRole = UserRole.CUSTOMER
    phone: str | None = Field(default=None, max_length=20, pattern=r"^[0-9+\-\s()]{7,20}$")
    address: str | None = Field(default=None, max_length=500)
    restaurant: RestaurantCreateInline | None = None

    _s = field_validator("name", "address", mode="before")(_strip)
    _e = field_validator("email", mode="before")(_norm_email)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one letter and one number")
        return v

    @model_validator(mode="after")
    def _owner_needs_restaurant(self):
        if self.role == UserRole.RESTAURANT_OWNER and self.restaurant is None:
            raise ValueError("Restaurant details are required when registering as a restaurant owner")
        if self.role != UserRole.RESTAURANT_OWNER:
            self.restaurant = None
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)

    _e = field_validator("email", mode="before")(_norm_email)


OtpPurpose = Literal["signup", "login"]


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$", description="The 6-digit code from the email")

    _e = field_validator("email", mode="before")(_norm_email)
    _c = field_validator("code", mode="before")(_strip)


class ResendRequest(BaseModel):
    email: EmailStr
    purpose: OtpPurpose

    _e = field_validator("email", mode="before")(_norm_email)


class OtpChallenge(BaseModel):
    """Returned instead of a token when an email code is still needed."""

    status: Literal["verification_required", "otp_required"]
    email: str = Field(description="Masked email the code was sent to, e.g. a***h@gmail.com")
    purpose: OtpPurpose
    resend_in: int = Field(description="Seconds until /auth/otp/resend will accept a request")
    detail: str | None = None


class ResendOut(BaseModel):
    detail: str
    resend_in: int


class UserOut(ORMModel):
    id: int
    name: str
    email: str
    role: UserRole
    phone: str | None
    address: str | None
    created_at: datetime
    restaurant_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=20, pattern=r"^[0-9+\-\s()]{7,20}$")
    address: str | None = Field(default=None, max_length=500)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# --------------------------------------------------------------------------- restaurants & menu
class RestaurantOut(ORMModel):
    id: int
    name: str
    description: str | None
    cuisine: str | None
    address: str | None
    phone: str | None
    image_url: str | None
    is_open: bool
    rating_avg: MoneyOut
    rating_count: int
    created_at: datetime


class RestaurantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    cuisine: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=20)
    image_url: str | None = Field(default=None, max_length=500)
    is_open: bool | None = None


class MenuItemBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    price: PriceIn
    category: str | None = Field(default=None, max_length=80)
    is_veg: bool = True
    image_url: str | None = Field(default=None, max_length=500)
    is_available: bool = True

    _s = field_validator("name", "description", "category", "image_url", mode="before")(_strip)


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    price: PriceIn | None = None
    category: str | None = Field(default=None, max_length=80)
    is_veg: bool | None = None
    image_url: str | None = Field(default=None, max_length=500)
    is_available: bool | None = None


class AvailabilityUpdate(BaseModel):
    is_available: bool


class MenuItemOut(ORMModel):
    id: int
    restaurant_id: int
    name: str
    description: str | None
    price: MoneyOut
    category: str | None
    is_veg: bool
    image_url: str | None
    is_available: bool
    created_at: datetime
    updated_at: datetime


class DishSearchOut(MenuItemOut):
    restaurant_name: str


class ReviewOut(ORMModel):
    id: int
    order_id: int
    rating: int
    comment: str | None
    created_at: datetime
    customer_name: str


class RestaurantDetailOut(RestaurantOut):
    categories: list[str]


# --------------------------------------------------------------------------- orders
class OrderItemIn(BaseModel):
    menu_item_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=50)


class OrderCreate(BaseModel):
    restaurant_id: int = Field(gt=0)
    items: list[OrderItemIn] = Field(min_length=1, max_length=50)
    delivery_address: str = Field(min_length=5, max_length=500)
    contact_phone: str | None = Field(default=None, max_length=20, pattern=r"^[0-9+\-\s()]{7,20}$")
    notes: str | None = Field(default=None, max_length=500)
    payment_method: PaymentMethod = PaymentMethod.CARD

    _s = field_validator("delivery_address", "notes", mode="before")(_strip)


class QuoteRequest(BaseModel):
    restaurant_id: int = Field(gt=0)
    items: list[OrderItemIn] = Field(min_length=1, max_length=50)


class QuoteLine(BaseModel):
    menu_item_id: int
    item_name: str
    unit_price: MoneyOut
    quantity: int
    line_total: MoneyOut


class QuoteOut(BaseModel):
    restaurant_id: int
    lines: list[QuoteLine]
    subtotal: MoneyOut
    delivery_fee: MoneyOut
    tax: MoneyOut
    total: MoneyOut


class OrderItemOut(ORMModel):
    id: int
    menu_item_id: int | None
    item_name: str
    unit_price: MoneyOut
    quantity: int
    line_total: MoneyOut


class PaymentOut(ORMModel):
    id: int
    entry_type: LedgerEntryType
    status: LedgerEntryStatus
    amount: MoneyOut
    method: PaymentMethod
    transaction_ref: str
    note: str | None
    created_at: datetime


class StatusHistoryOut(ORMModel):
    id: int
    from_status: OrderStatus | None
    to_status: OrderStatus
    note: str | None
    created_at: datetime


class PersonOut(BaseModel):
    id: int
    name: str
    phone: str | None = None


class ReturnBrief(ORMModel):
    id: int
    status: ReturnStatus
    reason: str
    resolution_note: str | None
    created_at: datetime
    resolved_at: datetime | None


class ReviewBrief(ORMModel):
    id: int
    rating: int
    comment: str | None
    created_at: datetime


class RestaurantBrief(BaseModel):
    id: int
    name: str
    phone: str | None = None
    image_url: str | None = None


class ItemPreview(BaseModel):
    name: str
    quantity: int


class OrderSummaryOut(BaseModel):
    id: int
    status: OrderStatus
    payment_status: PaymentStatus
    payment_method: PaymentMethod
    total_amount: MoneyOut
    item_count: int
    items_preview: list[ItemPreview]
    restaurant: RestaurantBrief
    customer: PersonOut
    delivery_partner: PersonOut | None
    delivery_address: str
    contact_phone: str | None
    delivered_at: datetime | None
    created_at: datetime
    status_updated_at: datetime
    return_status: ReturnStatus | None
    has_review: bool
    allowed_actions: list[str]


class OrderOut(OrderSummaryOut):
    subtotal: MoneyOut
    delivery_fee: MoneyOut
    tax: MoneyOut
    notes: str | None
    cancel_reason: str | None
    items: list[OrderItemOut]
    payments: list[PaymentOut]
    status_history: list[StatusHistoryOut]
    return_request: ReturnBrief | None
    review: ReviewBrief | None


class StatusUpdate(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=500)


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class AssignRequest(BaseModel):
    delivery_partner_id: int = Field(gt=0)


class DeliveryPartnerOut(BaseModel):
    id: int
    name: str
    phone: str | None
    active_deliveries: int
    completed_deliveries: int


# --------------------------------------------------------------------------- reviews & returns
class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)

    _s = field_validator("comment", mode="before")(_strip)


class ReturnCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)

    _s = field_validator("reason", mode="before")(_strip)


class ReturnDecision(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ReturnOut(ORMModel):
    id: int
    order_id: int
    status: ReturnStatus
    reason: str
    resolution_note: str | None
    created_at: datetime
    resolved_at: datetime | None
    customer_name: str
    order_total: MoneyOut
    order_status: OrderStatus
    payment_status: PaymentStatus


# --------------------------------------------------------------------------- owner stats & reminders
class DailyRevenue(BaseModel):
    date: date
    orders: int
    revenue: float


class TopItem(BaseModel):
    name: str
    quantity: int
    revenue: float


class RestaurantStats(BaseModel):
    total_orders: int
    orders_today: int
    active_orders: int
    delivered_orders: int
    cancelled_orders: int
    refunded_orders: int
    gross_revenue: float
    net_revenue: float
    refunded_amount: float
    average_order_value: float
    rating_avg: float
    rating_count: int
    pending_returns: int
    open_reminders: int
    menu_items_total: int
    menu_items_available: int
    orders_by_status: dict[str, int]
    revenue_last_7_days: list[DailyRevenue]
    top_items: list[TopItem]


class ReminderOut(ORMModel):
    id: int
    order_id: int
    order_status: OrderStatus
    message: str
    minutes_pending: int
    is_resolved: bool
    created_at: datetime
    resolved_at: datetime | None


class DeliveryStats(BaseModel):
    active: int
    delivered_total: int
    delivered_today: int


# --------------------------------------------------------------------------- AI
class AIInsightRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)

    _s = field_validator("question", mode="before")(_strip)


class AIInsightResponse(BaseModel):
    question: str
    answer: str
    model: str
    orders_considered: int
    generated_at: datetime


class AIStatus(BaseModel):
    enabled: bool
    model: str | None
    rate_limit_per_minute: int


OrderSort = Literal["newest", "oldest"]
DateFilter = date
