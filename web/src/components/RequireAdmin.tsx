import { Navigate, Outlet } from "react-router-dom";
import { useMe, useIsAdmin } from "../api/auth";

export function RequireAdmin() {
  const { isLoading } = useMe();
  const isAdmin = useIsAdmin();

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/painel" replace />;
  return <Outlet />;
}
