"""Idempotent demo-data seeder.

Usage:  python -m app.seed
Creates demo accounts for all three roles, six restaurants with menus and a realistic
order history (built through the real order service so ledgers/history are consistent).
"""

import logging
import random
from datetime import timedelta

from sqlalchemy import select

from app.core.database import SessionLocal, utcnow
from app.core.security import hash_password
from app.models import MenuItem, Order, Restaurant, ReturnRequest, ReturnStatus, Review, User, UserRole
from app.schemas import OrderCreate, OrderItemIn
from app.services import order_service as svc

logger = logging.getLogger("campusbite.seed")

DEMO_PASSWORD = "CampusBite@123"

RESTAURANTS = [
    ("Spice Route", "North Indian", "Rich curries, smoky tandoor and buttery breads.", "MG Road, Bengaluru", [
        ("Butter Chicken", 320, "Mains", False, "Tandoori chicken simmered in a velvety tomato-butter gravy."),
        ("Paneer Tikka Masala", 280, "Mains", True, "Charred cottage cheese in spiced onion-tomato masala."),
        ("Dal Makhani", 220, "Mains", True, "Black lentils slow-cooked overnight with cream."),
        ("Chicken Tikka", 290, "Starters", False, "Yoghurt-marinated chicken from the tandoor."),
        ("Hara Bhara Kebab", 190, "Starters", True, "Spinach and pea patties with mint chutney."),
        ("Butter Naan", 55, "Breads", True, "Soft leavened bread brushed with butter."),
        ("Garlic Naan", 65, "Breads", True, "Naan topped with garlic and coriander."),
        ("Jeera Rice", 150, "Rice", True, "Basmati tempered with cumin."),
        ("Gulab Jamun", 90, "Desserts", True, "Two warm milk dumplings in rose syrup."),
    ]),
    ("Dosa Junction", "South Indian", "Crispy dosas, fluffy idlis and filter coffee.", "Indiranagar, Bengaluru", [
        ("Masala Dosa", 120, "Dosa", True, "Crisp rice crepe with spiced potato filling."),
        ("Ghee Roast Dosa", 150, "Dosa", True, "Paper-thin dosa roasted in ghee."),
        ("Mysore Masala Dosa", 140, "Dosa", True, "Dosa with fiery red chutney and potato."),
        ("Idli Sambar (2 pc)", 80, "Breakfast", True, "Steamed rice cakes with sambar and chutney."),
        ("Medu Vada (2 pc)", 90, "Breakfast", True, "Crispy lentil doughnuts."),
        ("Chicken Chettinad", 260, "Mains", False, "Peppery Chettinad-style chicken curry."),
        ("Lemon Rice", 110, "Rice", True, "Tangy rice with peanuts and curry leaves."),
        ("Filter Coffee", 50, "Beverages", True, "Strong South Indian decoction coffee."),
    ]),
    ("Wok This Way", "Chinese", "Indo-Chinese favourites, tossed hot in the wok.", "Koramangala, Bengaluru", [
        ("Veg Hakka Noodles", 180, "Noodles", True, "Stir-fried noodles with crunchy vegetables."),
        ("Chicken Schezwan Noodles", 220, "Noodles", False, "Spicy Schezwan noodles with chicken."),
        ("Chilli Paneer", 240, "Starters", True, "Crispy paneer tossed with peppers and chilli."),
        ("Chicken Manchurian", 250, "Starters", False, "Chicken dumplings in Manchurian sauce."),
        ("Veg Fried Rice", 170, "Rice", True, "Wok-tossed rice with vegetables and soy."),
        ("Hot & Sour Soup", 130, "Soups", True, "Classic spicy and tangy soup."),
        ("Veg Momos (8 pc)", 140, "Dim Sum", True, "Steamed dumplings with fiery dip."),
    ]),
    ("Napoli Slice", "Italian", "Wood-fired pizzas and fresh pasta.", "HSR Layout, Bengaluru", [
        ("Margherita Pizza", 299, "Pizza", True, "San Marzano tomato, mozzarella and basil."),
        ("Pepperoni Pizza", 399, "Pizza", False, "Loaded with spicy pepperoni."),
        ("Farmhouse Pizza", 349, "Pizza", True, "Mushroom, peppers, onion and olives."),
        ("Penne Arrabbiata", 280, "Pasta", True, "Penne in spicy tomato-garlic sauce."),
        ("Spaghetti Carbonara", 340, "Pasta", False, "Creamy egg sauce with chicken ham."),
        ("Garlic Bread", 140, "Sides", True, "Toasted baguette with herb-garlic butter."),
        ("Tiramisu", 220, "Desserts", True, "Coffee-soaked layers with mascarpone."),
    ]),
    ("The Burger Lab", "American", "Smash burgers, loaded fries and thick shakes.", "Whitefield, Bengaluru", [
        ("Classic Smash Burger", 249, "Burgers", False, "Double smashed patty, cheese and pickles."),
        ("Crispy Chicken Burger", 229, "Burgers", False, "Buttermilk fried chicken with slaw."),
        ("Veggie Crunch Burger", 189, "Burgers", True, "Crispy veg patty with chipotle mayo."),
        ("Peri Peri Fries", 129, "Sides", True, "Fries dusted with peri peri spice."),
        ("Loaded Cheese Fries", 169, "Sides", True, "Fries smothered in cheese sauce."),
        ("Oreo Thick Shake", 179, "Shakes", True, "Blended with real Oreo cookies."),
    ]),
    ("Bowl & Greens", "Healthy", "Protein bowls, salads and fresh juices.", "JP Nagar, Bengaluru", [
        ("Grilled Chicken Bowl", 320, "Bowls", False, "Brown rice, grilled chicken, greens and tahini."),
        ("Paneer Quinoa Bowl", 300, "Bowls", True, "Quinoa, grilled paneer and roasted veg."),
        ("Greek Salad", 240, "Salads", True, "Feta, olives, cucumber and tomato."),
        ("Caesar Salad", 260, "Salads", False, "Romaine, parmesan, croutons and chicken."),
        ("Cold Pressed Orange Juice", 150, "Juices", True, "Freshly pressed, no added sugar."),
        ("Avocado Toast", 230, "Breakfast", True, "Sourdough with smashed avocado and seeds."),
    ]),
]

# Free Unsplash photos (hotlinked as Unsplash requires). Each one was checked by eye against
# the dish it's assigned to; dishes without a verified match fall back to the UI's illustration.
_UNSPLASH = "https://images.unsplash.com/photo-{}?auto=format&fit=crop&w={}&q=70"
RESTAURANT_IMAGES = {
    "Spice Route": "1585937421612-70a008356fbe",
    "Dosa Junction": "1630383249896-424e482df921",
    "Wok This Way": "1585032226651-759b368d7246",
    "Napoli Slice": "1513104890138-7c749659a591",
    "The Burger Lab": "1568901346375-23c9450c58cd",
    "Bowl & Greens": "1512621776951-a57141f2eefd",
}
DISH_IMAGES = {
    "Butter Chicken": "1603894584373-5ac82b2ae398",
    "Paneer Tikka Masala": "1631452180519-c014fe946bc7",
    "Chicken Tikka": "1599487488170-d11ec9c172f0",
    "Butter Naan": "1565557623262-b51c2513a641",
    "Jeera Rice": "1596560548464-f010549b84d7",
    "Masala Dosa": "1668236543090-82eba5ee5976",
    "Ghee Roast Dosa": "1668236543090-82eba5ee5976",
    "Mysore Masala Dosa": "1668236543090-82eba5ee5976",
    "Idli Sambar (2 pc)": "1589301760014-d929f3979dbc",
    "Filter Coffee": "1509042239860-f550ce710b93",
    "Veg Hakka Noodles": "1585032226651-759b368d7246",
    "Chicken Schezwan Noodles": "1612929633738-8fe44f7ec841",
    "Veg Fried Rice": "1603133872878-684f208fb84b",
    "Hot & Sour Soup": "1547592166-23ac45744acd",
    "Veg Momos (8 pc)": "1534422298391-e4f8c172dddb",
    "Margherita Pizza": "1574071318508-1cdbab80d002",
    "Pepperoni Pizza": "1628840042765-356cda07504e",
    "Farmhouse Pizza": "1565299624946-b28f40a0ae38",
    "Spaghetti Carbonara": "1612874742237-6526221588e3",
    "Garlic Bread": "1619535860434-ba1d8fa12536",
    "Tiramisu": "1571877227200-a0d98ea607e9",
    "Classic Smash Burger": "1571091718767-18b5b1457add",
    "Crispy Chicken Burger": "1606755962773-d324e0a13086",
    "Veggie Crunch Burger": "1520072959219-c595dc870360",
    "Peri Peri Fries": "1585109649139-366815a0d713",
    "Loaded Cheese Fries": "1573080496219-bb080dd4f877",
    "Oreo Thick Shake": "1572490122747-3968b75cc699",
    "Paneer Quinoa Bowl": "1546069901-ba9599a7e63c",
    "Greek Salad": "1540420773420-3366772f4999",
    "Caesar Salad": "1550304943-4f24f54ddde9",
    "Cold Pressed Orange Juice": "1600271886742-f049cd451bba",
    "Avocado Toast": "1541519227354-08fa5d50c44d",
}


def apply_demo_images(db) -> int:
    """Fill image_url on demo restaurants/dishes that have none. Idempotent; never overwrites
    an image an owner set. Only touches restaurants owned by the seeded @campusbite.dev owners."""
    changed = 0
    demo = db.scalars(
        select(Restaurant).join(User, User.id == Restaurant.owner_id).where(User.email.like("owner%@campusbite.dev"))
    )
    for r in demo:
        if not r.image_url and r.name in RESTAURANT_IMAGES:
            r.image_url = _UNSPLASH.format(RESTAURANT_IMAGES[r.name], 1200)
            changed += 1
        for m in r.menu_items:
            if not m.image_url and m.name in DISH_IMAGES:
                m.image_url = _UNSPLASH.format(DISH_IMAGES[m.name], 400)
                changed += 1
    db.commit()
    return changed


CUSTOMERS = [
    ("Aarav Sharma", "customer@campusbite.dev", "9810000001", "Flat 402, Prestige Shantiniketan, Whitefield, Bengaluru"),
    ("Diya Patel", "diya@campusbite.dev", "9810000002", "21, 5th Cross, Indiranagar, Bengaluru"),
]
RIDERS = [
    ("Ravi Kumar", "rider@campusbite.dev", "9820000001"),
    ("Sana Khan", "rider2@campusbite.dev", "9820000002"),
]


def _user(db, name, email, role, phone=None, address=None) -> User:
    u = User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD), role=role, phone=phone, address=address,
             is_verified=True)  # demo accounts are pre-verified
    db.add(u)
    db.flush()
    return u


def _shift(db, order: Order, minutes_ago: int):
    """Back-date an order and its history so analytics look realistic."""
    ts = utcnow() - timedelta(minutes=minutes_ago)
    order.created_at = ts
    for i, h in enumerate(order.status_history):
        h.created_at = ts + timedelta(minutes=8 * i)
    for p in order.payments:
        p.created_at = ts
    order.status_updated_at = ts + timedelta(minutes=8 * (len(order.status_history) - 1))
    if order.delivered_at:
        order.delivered_at = order.status_updated_at


def seed() -> bool:
    rng = random.Random(42)
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == "customer@campusbite.dev")):
            logger.info("Demo data already present — skipping seed (filled %d missing images)", apply_demo_images(db))
            return False

        customers = [_user(db, n, e, UserRole.CUSTOMER, p, a) for n, e, p, a in CUSTOMERS]
        riders = [_user(db, n, e, UserRole.DELIVERY_PARTNER, p) for n, e, p in RIDERS]

        restaurants: list[tuple[User, Restaurant, list[MenuItem]]] = []
        for idx, (name, cuisine, desc, addr, dishes) in enumerate(RESTAURANTS, start=1):
            email = "owner@campusbite.dev" if idx == 1 else f"owner{idx}@campusbite.dev"
            owner = _user(db, f"{name} Owner", email, UserRole.RESTAURANT_OWNER, f"98300000{idx:02d}")
            r = Restaurant(owner_id=owner.id, name=name, cuisine=cuisine, description=desc, address=addr,
                           phone=f"080-4000-00{idx:02d}")
            db.add(r)
            db.flush()
            items = [MenuItem(restaurant_id=r.id, name=n, price=p, category=c, is_veg=v, description=d)
                     for n, p, c, v, d in dishes]
            db.add_all(items)
            db.flush()
            restaurants.append((owner, r, items))
        # One sold-out dish to demonstrate availability.
        restaurants[0][2][-2].is_available = False
        db.commit()

        # (customer_idx, restaurant_idx, final_status, minutes_ago)
        plan = [
            (0, 0, "DELIVERED", 60 * 24 * 12), (0, 1, "DELIVERED", 60 * 24 * 9), (0, 3, "DELIVERED", 60 * 24 * 6),
            (0, 0, "DELIVERED", 60 * 24 * 4), (0, 4, "CANCELLED", 60 * 24 * 3), (0, 0, "DELIVERED", 60 * 24 * 2),
            (0, 2, "RETURN_PENDING", 60 * 26), (0, 0, "REFUNDED", 60 * 30), (0, 5, "OUT_FOR_DELIVERY", 35),
            (0, 0, "PREPARING", 12), (0, 0, "PLACED", 25), (0, 0, "ACCEPTED", 40),
            (1, 0, "DELIVERED", 60 * 24 * 5), (1, 0, "READY", 10), (1, 1, "DELIVERED", 60 * 24), (1, 0, "PLACED", 3),
        ]
        path = ["ACCEPTED", "PREPARING", "READY", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]
        for ci, ri, final, ago in plan:
            cust = customers[ci]
            owner, rest, items = restaurants[ri]
            avail = [m for m in items if m.is_available]
            picks = rng.sample(avail, k=min(len(avail), rng.randint(1, 3)))
            order = svc.place_order(db, cust, OrderCreate(
                restaurant_id=rest.id, delivery_address=cust.address, payment_method=rng.choice(["card", "upi", "wallet"]),
                items=[OrderItemIn(menu_item_id=m.id, quantity=rng.randint(1, 3)) for m in picks],
            ))
            order = svc.get_order_for_user(db, order.id, cust)
            rider = riders[rng.randint(0, 1)]
            if final == "CANCELLED":
                svc.cancel_order(db, order, cust, "Changed my mind")
            else:
                target = {"RETURN_PENDING": "DELIVERED", "REFUNDED": "DELIVERED"}.get(final, final)
                if target != "PLACED":
                    for st in path:
                        if st == "ASSIGNED":
                            svc.assign_partner(db, order, owner, rider.id)
                        else:
                            actor = rider if st in ("OUT_FOR_DELIVERY", "DELIVERED") else owner
                            svc.transition(db, order, svc.S(st), actor)
                            db.commit()
                        if st == target:
                            break
                if final in ("RETURN_PENDING", "REFUNDED"):
                    rr = ReturnRequest(order_id=order.id, customer_id=cust.id, restaurant_id=rest.id,
                                       reason="One of the items was missing and the curry was cold.")
                    db.add(rr)
                    db.flush()
                    if final == "REFUNDED":
                        svc.transition(db, order, svc.S.REFUNDED, owner, "Return approved")
                        svc.record_refund(db, order, f"Refund for approved return #{rr.id}")
                        rr.status = ReturnStatus.APPROVED
                        rr.resolution_note = "Apologies — full refund issued."
                        rr.resolved_by_id = owner.id
                        rr.resolved_at = utcnow()
                    db.commit()
                if final == "DELIVERED" and rng.random() < 0.8:
                    rating = rng.choice([4, 5, 5, 3, 4])
                    db.add(Review(order_id=order.id, customer_id=cust.id, restaurant_id=rest.id, rating=rating,
                                  comment=rng.choice(["Loved it!", "Hot and fresh.", "Great portion size.",
                                                      "Delivery was quick.", None])))
                    n = rest.rating_count
                    rest.rating_avg = round((float(rest.rating_avg) * n + rating) / (n + 1), 2)
                    rest.rating_count = n + 1
                    db.commit()
            db.refresh(order)
            _shift(db, order, ago)
            db.commit()

        apply_demo_images(db)
        logger.info("Seeded demo data: %d restaurants, %d orders", len(restaurants), len(plan))
        return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    seed()
