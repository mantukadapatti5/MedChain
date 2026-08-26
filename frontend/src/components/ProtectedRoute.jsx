import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ role, children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    const homeByRole = { vendor: "/vendor", distributor: "/distributor", admin: "/admin", client: "/client" };
    return <Navigate to={homeByRole[user.role] || "/login"} replace />;
  }
  return children;
}
