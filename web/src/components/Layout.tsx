import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { MobileTopbar } from "./MobileTopbar";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <MobileTopbar />
      <main className="main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
