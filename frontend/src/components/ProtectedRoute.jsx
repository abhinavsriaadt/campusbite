import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../utils/constants";
import { PageLoader } from "./ui";

/**
 * Route guard. Unauthenticated users go to /login (and come back afterwards);
 * authenticated users with the wrong role are sent to their own dashboard.
 * NOTE: this is UX only — the backend independently enforces every permission.
 */
export default function ProtectedRoute({ roles }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] || "/"} replace />;
  return <Outlet />;
}

/** Sends staff roles to their dashboards when they hit the customer landing page. */
export function CustomerLanding({ children }) {
  const { user } = useAuth();
  if (user && user.role !== "customer") return <Navigate to={ROLE_HOME[user.role]} replace />;
  return children;
}
