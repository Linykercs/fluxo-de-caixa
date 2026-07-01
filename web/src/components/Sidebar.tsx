import { NavLink } from "react-router-dom";
import { useIsAdmin, useLogout } from "../api/auth";
import { useBankAccounts } from "../api/bank-accounts";
import { formatBRLNumber } from "../lib/money";

const NAV_MAIN = [
  { to: "/painel", label: "Painel" },
  { to: "/a-pagar", label: "A pagar" },
  { to: "/a-receber", label: "A receber" },
  { to: "/orcamentos", label: "Orçamentos" },
  { to: "/relatorios", label: "Relatórios" },
];

const NAV_ADMIN = [
  { to: "/contas", label: "Contas bancárias" },
  { to: "/importar-extrato", label: "Importar extrato" },
  { to: "/categorias", label: "Categorias" },
  { to: "/centros-de-custo", label: "Centros de custo" },
  { to: "/usuarios", label: "Usuários" },
  { to: "/notificacoes", label: "Notificações" },
];

const NAV_ACCOUNT = [
  { to: "/meu-perfil", label: "Minha conta" },
];

export function Sidebar() {
  const { data: accounts } = useBankAccounts();
  const isAdmin = useIsAdmin();
  const logout = useLogout();

  const total = accounts?.reduce((sum, account) => sum + account.balanceCents, 0) ?? 0;

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => window.location.assign("/login") });
  }

  return (
    <div className="sidebar">
      <div className="brand">
        <img src="/logo.svg" alt="FluxoCaixa" className="brand-logo" />
        FluxoCaixa
      </div>
      <nav>
        {NAV_MAIN.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
            {item.label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="nav-section">Administração</div>
            {NAV_ADMIN.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
        <div className="nav-section">Conta</div>
        {NAV_ACCOUNT.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : undefined)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="accounts">
        <div className="accounts-title">Saldos</div>
        {accounts?.map((account) => (
          <div className="acct-row" key={account.id}>
            <span className="acct-name">{account.name}</span>
            <b className="money">{formatBRLNumber(account.balanceCents)}</b>
          </div>
        ))}
        <div className="acct-row total">
          <span className="acct-name">Total</span>
          <b className="money">{formatBRLNumber(total)}</b>
        </div>
      </div>
      <div className="logout">
        <button type="button" onClick={handleLogout} disabled={logout.isPending}>
          Sair
        </button>
      </div>
    </div>
  );
}
