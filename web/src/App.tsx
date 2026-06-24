import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { RequireAuth } from "./components/RequireAuth";
import { AccountsPage } from "./pages/AccountsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CostCentersPage } from "./pages/CostCentersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EntriesPage } from "./pages/EntriesPage";
import { ImportStatementPage } from "./pages/ImportStatementPage";
import { LoginPage } from "./pages/LoginPage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { MeuPerfilPage } from "./pages/MeuPerfilPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/painel" replace />} />
          <Route path="/painel" element={<DashboardPage />} />
          <Route path="/a-pagar" element={<EntriesPage direction="PAYABLE" />} />
          <Route path="/a-receber" element={<EntriesPage direction="RECEIVABLE" />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/meu-perfil" element={<MeuPerfilPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/contas" element={<AccountsPage />} />
            <Route path="/importar-extrato" element={<ImportStatementPage />} />
            <Route path="/categorias" element={<CategoriesPage />} />
            <Route path="/centros-de-custo" element={<CostCentersPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
