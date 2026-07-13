import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { RequireAuth } from "./components/RequireAuth";
import { LoginPage } from "./pages/LoginPage";

// Cada página vira um chunk próprio; só LoginPage fica no chunk inicial
// (é a primeira tela de quem não está logado).
const AccountsPage = lazy(() => import("./pages/AccountsPage").then((m) => ({ default: m.AccountsPage })));
const BudgetsPage = lazy(() => import("./pages/BudgetsPage").then((m) => ({ default: m.BudgetsPage })));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })));
const CostCentersPage = lazy(() => import("./pages/CostCentersPage").then((m) => ({ default: m.CostCentersPage })));
const CounterpartiesPage = lazy(() => import("./pages/CounterpartiesPage").then((m) => ({ default: m.CounterpartiesPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const EntriesPage = lazy(() => import("./pages/EntriesPage").then((m) => ({ default: m.EntriesPage })));
const ImportStatementPage = lazy(() => import("./pages/ImportStatementPage").then((m) => ({ default: m.ImportStatementPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const MeuPerfilPage = lazy(() => import("./pages/MeuPerfilPage").then((m) => ({ default: m.MeuPerfilPage })));
const MorePage = lazy(() => import("./pages/MorePage").then((m) => ({ default: m.MorePage })));

export function App() {
  return (
    <Suspense fallback={<div className="route-loading">Carregando…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/painel" replace />} />
            <Route path="/painel" element={<DashboardPage />} />
            <Route path="/a-pagar" element={<EntriesPage direction="PAYABLE" />} />
            <Route path="/a-receber" element={<EntriesPage direction="RECEIVABLE" />} />
            <Route path="/orcamentos" element={<BudgetsPage />} />
            <Route path="/relatorios" element={<ReportsPage />} />
            <Route path="/meu-perfil" element={<MeuPerfilPage />} />
            <Route path="/mais" element={<MorePage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/contas" element={<AccountsPage />} />
              <Route path="/importar-extrato" element={<ImportStatementPage />} />
              <Route path="/categorias" element={<CategoriesPage />} />
              <Route path="/centros-de-custo" element={<CostCentersPage />} />
              <Route path="/clientes" element={<CounterpartiesPage />} />
              <Route path="/usuarios" element={<UsersPage />} />
              <Route path="/notificacoes" element={<NotificationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/painel" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
