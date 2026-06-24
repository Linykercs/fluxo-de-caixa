import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "../api/auth";

export function RequireAuth() {
  const { data, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <div className="login-page">
        <p>Carregando…</p>
      </div>
    );
  }

  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
