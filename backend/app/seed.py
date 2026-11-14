"""Demo-data seeder: 45 Lucknow restaurants in 9 categories, from seed_data_lucknow.json.

Usage (from backend/, or inside the container):
    python seed.py            # idempotent: does nothing if categories already exist
    python seed.py --reset    # wipe all restaurant/order data and re-seed (one transaction)
    python -m app.seed        # same as `python seed.py` (used by docker-entrypoint.sh)

Demo data for educational use. Not affiliated with any restaurant; menus and prices are
illustrative. Orders are created through the real order service, so totals, ledgers and
status history follow the same rules as the API.
"""

import argparse
import json
import logging
import random
from datetime import timedelta
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, utcnow
from app.core.security import hash_password
from app.models import (
    AdminReminderLog,
    Category,
    MenuItem,
    Order,
    OrderItem,
    OrderStatusHistory,
    PaymentLedger,
    Restaurant,
    ReturnRequest,
    ReturnStatus,
    Review,
    User,
    UserRole,
    restaurant_categories,
)
from app.schemas import OrderCreate, OrderItemIn
from app.services import order_service as svc
from app.services.reminder_service import generate_reminders

logger = logging.getLogger("campusbite.seed")

DATA_FILE = Path(__file__).resolve().parent.parent / "seed_data_lucknow.json"
DEMO_DOMAIN = "@campusbite.dev"

# Delivery addresses for the demo customers (the data file has none; orders need one).
CUSTOMER_ADDRESSES = [
    "Room 214, Boys Hostel, Lucknow University, Lucknow",
    "B-12, Sector 4, Gomti Nagar, Lucknow",
    "45 Aliganj Main Road, Lucknow",
]

# The demo history: (customer index, restaurant name, final status, minutes ago).
# Two orders are left PLACED/ACCEPTED for longer than 15 minutes so reminders appear.
ORDER_PLAN = [
    (0, "Tunday Kababi", "DELIVERED", 60 * 24 * 13),
    (1, "Royal Cafe", "DELIVERED", 60 * 24 * 12),
    (2, "Starbucks", "DELIVERED", 60 * 24 * 11),
    (0, "Thennai", "DELIVERED", 60 * 24 * 10),
    (1, "Tunday Kababi", "DELIVERED", 60 * 24 * 9),
    (2, "Nainital Momos", "CANCELLED", 60 * 24 * 8),
    (0, "Idrees Biryani", "DELIVERED", 60 * 24 * 7),
    (1, "Madhurima Sweets", "DELIVERED", 60 * 24 * 6),
    (2, "Tunday Kababi", "RETURN_PENDING", 60 * 24 * 5),
    (0, "The Cherry Tree Cafe", "REFUNDED", 60 * 24 * 4),
    (1, "Faasos", "DELIVERED", 60 * 24 * 3),
    (2, "Sugar Daddy", "DELIVERED", 60 * 24 * 2),
    (0, "Tunday Kababi", "DELIVERED", 60 * 24),
    (1, "Starbucks", "OUT_FOR_DELIVERY", 35),
    (2, "Tunday Kababi", "ASSIGNED", 28),
    (0, "Royal Cafe", "READY", 18),
    (1, "Tunday Kababi", "PREPARING", 12),
    (2, "Tunday Kababi", "ACCEPTED", 40),  # stale → reminder
    (0, "Tunday Kababi", "PLACED", 25),    # stale → reminder
    (1, "Wow! Momo", "PLACED", 4),
]
REVIEWS = [  # (index into ORDER_PLAN, rating, comment) — all on DELIVERED orders
    (0, 5, "Galouti kebabs were melt-in-the-mouth. Arrived hot."),
    (1, 4, "Basket chaat travelled surprisingly well."),
    (6, 5, "Proper Lucknowi biryani, generous portion."),
]
PATH = ["ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]


def load_data(path: Path = DATA_FILE) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def demo_password(data: dict) -> str:
    # "_meta.demo_password" reads "Password@123 (bcrypt-hash in seed.py)"; the first word is the password.
    return data["_meta"]["demo_password"].split()[0]


def _get_or_create_user(db: Session, *, name, email, phone, role, password_hash, address=None) -> User:
    email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(name=name, email=email, phone=phone, role=role, address=address, password_hash=password_hash)
        db.add(user)
        db.flush()
    return user


def reset(db: Session) -> None:
    """Delete every restaurant, menu, order and the seeded owner accounts (FK-safe order).
    Seeded customers/riders and self-registered users are kept. Does not commit."""
    seeded_owners = select(User.id).where(User.role == UserRole.RESTAURANT_OWNER, User.email.like(f"%{DEMO_DOMAIN}"))
    for stmt in (
        delete(AdminReminderLog),
        delete(Review),
        delete(ReturnRequest),
        delete(PaymentLedger),
        delete(OrderStatusHistory),
        delete(OrderItem),
        delete(Order),
        delete(MenuItem),
        delete(restaurant_categories),
        delete(Restaurant),
        delete(Category),
        delete(User).where(User.id.in_(seeded_owners)),
    ):
        db.execute(stmt)
    db.flush()


def _insert_catalogue(db: Session, data: dict, pw_hash: str) -> dict[str, Restaurant]:
    cats = {}
    for c in data["categories"]:
        cat = Category(slug=c["slug"], name=c["name"], description=c.get("description"))
        db.add(cat)
        cats[c["slug"]] = cat
    db.flush()

    restaurants = {}
    for r in data["restaurants"]:
        o = r["owner"]
        owner = _get_or_create_user(db, name=o["name"], email=o["email"], phone=o.get("phone"),
                                    role=UserRole.RESTAURANT_OWNER, password_hash=pw_hash)
        rest = Restaurant(
            owner_id=owner.id, name=r["name"], cuisine=r.get("cuisine"), description=r.get("description"),
            address=r.get("address"), phone=o.get("phone"), image_url=r.get("image_url"),
            is_open=r.get("is_open", True), cost_for_two=r.get("cost_for_two"),
            primary_category=cats[r["primary_category"]], categories=[cats[s] for s in r["categories"]],
        )
        db.add(rest)
        db.flush()
        db.add_all(
            MenuItem(
                restaurant_id=rest.id, name=m["name"], description=m.get("description"), price=m["price"],
                category=m.get("category"), is_veg=m["is_veg"], is_available=m["is_available"],
                tags=list(m.get("tags", [])), image_url=m.get("image_url"),
            )
            for m in r["menu"]
        )
        restaurants[r["name"]] = rest
    db.flush()
    return restaurants


def _shift(order: Order, minutes_ago: int) -> None:
    """Back-date an order and its history so the dashboard and charts have a realistic spread."""
    ts = utcnow() - timedelta(minutes=minutes_ago)
    order.created_at = ts
    for i, h in enumerate(order.status_history):
        h.created_at = ts + timedelta(minutes=min(8 * i, max(0, minutes_ago - 1)))
    for p in order.payments:
        p.created_at = ts
    steps = len(order.status_history) - 1
    order.status_updated_at = ts + timedelta(minutes=min(8 * steps, max(0, minutes_ago - 1))) if steps else ts
    if order.delivered_at:
        order.delivered_at = order.status_updated_at


def _insert_orders(db: Session, restaurants: dict[str, Restaurant], customers: list[User], riders: list[User]) -> int:
    rng = random.Random(42)
    orders = []
    for ci, rname, final, ago in ORDER_PLAN:
        cust, rest = customers[ci], restaurants[rname]
        owner = rest.owner
        avail = [m for m in rest.menu_items if m.is_available]
        picks = rng.sample(avail, k=rng.randint(1, 3))
        order = svc.place_order(db, cust, OrderCreate(
            restaurant_id=rest.id, delivery_address=cust.address, payment_method=rng.choice(["card", "upi", "wallet"]),
            items=[OrderItemIn(menu_item_id=m.id, quantity=rng.randint(1, 2)) for m in picks],
        ))
        order = svc.get_order_for_user(db, order.id, cust)
        if final == "CANCELLED":
            svc.cancel_order(db, order, cust, "Ordered from the wrong restaurant")
        else:
            target = "DELIVERED" if final in ("RETURN_PENDING", "REFUNDED") else final
            if target != "PLACED":
                for st in PATH:
                    if st == "ASSIGNED":
                        svc.assign_partner(db, order, owner, riders[len(orders) % len(riders)].id)
                    else:
                        rider_step = st in ("OUT_FOR_DELIVERY", "DELIVERED")
                        actor = db.get(User, order.delivery_partner_id) if rider_step else owner
                        svc.transition(db, order, svc.S(st), actor)
                    db.commit()
                    if st == target:
                        break
            if final in ("RETURN_PENDING", "REFUNDED"):
                rr = ReturnRequest(order_id=order.id, customer_id=cust.id, restaurant_id=rest.id,
                                   reason="One item was missing and the gravy had spilled in the bag.")
                db.add(rr)
                db.flush()
                if final == "REFUNDED":
                    svc.transition(db, order, svc.S.REFUNDED, owner, "Return approved")
                    svc.record_refund(db, order, f"Refund for approved return #{rr.id}")
                    rr.status = ReturnStatus.APPROVED
                    rr.resolution_note = "Sorry about that, full refund issued."
                    rr.resolved_by_id = owner.id
                    rr.resolved_at = utcnow()
                db.commit()
        db.refresh(order)
        _shift(order, ago)
        db.commit()
        orders.append(order)

    for idx, rating, comment in REVIEWS:
        order = orders[idx]
        assert order.status == svc.S.DELIVERED, "reviews must be on delivered orders"
        rest = order.restaurant
        db.add(Review(order_id=order.id, customer_id=order.customer_id, restaurant_id=rest.id,
                      rating=rating, comment=comment, created_at=order.created_at + timedelta(hours=2)))
        n = rest.rating_count
        rest.rating_avg = round((float(rest.rating_avg) * n + rating) / (n + 1), 2)
        rest.rating_count = n + 1
    db.commit()
    return len(orders)


def seed(reset_first: bool = False, data: dict | None = None) -> dict | None:
    """Seed the database. Returns counts, or None when skipped."""
    data = data or load_data()
    with SessionLocal() as db:
        if not reset_first:
            if db.scalar(select(func.count()).select_from(Category)):
                logger.info("Categories already present — skipping seed (use --reset to reload)")
                return None
            old = db.scalar(
                select(func.count()).select_from(Restaurant).join(User, User.id == Restaurant.owner_id)
                .where(User.email.like(f"%{DEMO_DOMAIN}"))
            )
            if old:
                logger.warning("Older demo restaurants found — run `python seed.py --reset` to replace them")
                return None

        pw_hash = hash_password(demo_password(data))
        try:
            if reset_first:
                reset(db)
            users = data["demo_users"]
            customers = [
                _get_or_create_user(db, name=u["name"], email=u["email"], phone=u.get("phone"), role=UserRole.CUSTOMER,
                                    password_hash=pw_hash, address=CUSTOMER_ADDRESSES[i % len(CUSTOMER_ADDRESSES)])
                for i, u in enumerate(users["customers"])
            ]
            for c in customers:
                c.address = c.address or CUSTOMER_ADDRESSES[0]
            riders = [
                _get_or_create_user(db, name=u["name"], email=u["email"], phone=u.get("phone"),
                                    role=UserRole.DELIVERY_PARTNER, password_hash=pw_hash)
                for u in users["delivery_partners"]
            ]
            restaurants = _insert_catalogue(db, data, pw_hash)
            db.commit()  # the reset and the catalogue land together
        except Exception:
            db.rollback()
            raise

        n_orders = _insert_orders(db, restaurants, customers, riders)
        generate_reminders(db)
        counts = {
            "restaurants": db.scalar(select(func.count()).select_from(Restaurant)),
            "categories": db.scalar(select(func.count()).select_from(Category)),
            "menu_items": db.scalar(select(func.count()).select_from(MenuItem)),
            "orders": n_orders,
        }
        return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Seed CampusBite with the Lucknow demo data.")
    parser.add_argument("--reset", action="store_true",
                        help="delete all restaurants, menus, orders and seeded owners first (one transaction)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    counts = seed(reset_first=args.reset)
    if counts:
        print(f"{counts['restaurants']} restaurants, {counts['categories']} categories, "
              f"{counts['menu_items']} menu items, {counts['orders']} orders")


if __name__ == "__main__":
    main()
