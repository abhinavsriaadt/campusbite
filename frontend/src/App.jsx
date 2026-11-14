import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute, { CustomerLanding } from "./components/ProtectedRoute";
import { EmptyState, Logo, PageLoader } from "./components/ui";
import { ROLES } from "./utils/constants";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Verify from "./pages/auth/Verify";
import Restaurants from "./pages/customer/Restaurants";

// Route-level code splitting: each role only downloads its own screens.
const RestaurantMenu = lazy(() => import("./pages/customer/RestaurantMenu"));
const Cart = lazy(() => import("./pages/customer/Cart"));
const CustomerOrders = lazy(() => import("./pages/customer/CustomerOrders"));
const AiInsights = lazy(() => import("./pages/customer/AiInsights"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const OwnerDashboard = lazy(() => import("./pages/owner/OwnerDashboard"));
const OwnerOrders = lazy(() => import("./pages/owner/OwnerOrders"));
const MenuManagement = lazy(() => import("./pages/owner/MenuManagement"));
const OwnerReturns = lazy(() => import("./pages/owner/OwnerReturns"));
const RestaurantSettings = lazy(() => import("./pages/owner/RestaurantSettings"));
const DeliveryDashboard = lazy(() => import("./pages/delivery/DeliveryDashboard"));
// Dev-only component catalogue; tree-shaken out of production builds.
const Styleguide = import.meta.env.DEV ? lazy(() => import("./pages/Styleguide")) : null;

function NotFound() {
  return (
    <EmptyState media={<Logo variant="mark" height={56} className="empty__logo" />} title="Page not found" action={<Link to="/">Go home →</Link>}>
      The page you're looking for doesn't exist.
    </EmptyState>
  );
}

function Shell() {
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public browsing (customers & guests) */}
          <Route path="/" element={<CustomerLanding><Restaurants /></CustomerLanding>} />
          <Route path="/restaurants/:id" element={<CustomerLanding><RestaurantMenu /></CustomerLanding>} />

          {/* Any authenticated user */}
          <Route element={<ProtectedRoute />}>
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          <Route element={<ProtectedRoute roles={[ROLES.CUSTOMER]} />}>
            <Route path="/cart" element={<Cart />} />
            <Route path="/orders" element={<CustomerOrders />} />
            <Route path="/insights" element={<AiInsights />} />
          </Route>

          <Route element={<ProtectedRoute roles={[ROLES.OWNER]} />}>
            <Route path="/owner" element={<OwnerDashboard />} />
            <Route path="/owner/orders" element={<OwnerOrders />} />
            <Route path="/owner/menu" element={<MenuManagement />} />
            <Route path="/owner/returns" element={<OwnerReturns />} />
            <Route path="/owner/settings" element={<RestaurantSettings />} />
          </Route>

          <Route element={<ProtectedRoute roles={[ROLES.PARTNER]} />}>
            <Route path="/delivery" element={<DeliveryDashboard mode="active" />} />
            <Route path="/delivery/history" element={<DeliveryDashboard key="history" mode="history" />} />
          </Route>

          {Styleguide && <Route path="/styleguide" element={<Styleguide />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Auth pages use their own split layout, without the app chrome. */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}
