import { Link, Navigate } from "react-router-dom";
import { useIsAdmin, useLogout } from "../api/auth";
import { useBankAccounts } from "../api/bank-accounts";
import { formatBRLNumber } from "../lib/money";
import { useIsMobile } from "../lib/useIsMobile";

const LINKS_GERAL = [
  { to: "/orcamentos", label: "Orçamentos" },
  { to: "/meu-perfil", label: "Minha conta" },
];

const LINKS_ADMIN = [
  { to: "/contas", label: "Contas bancárias" },
  { to: "/importar-extrato", label: "Importar extrato" },
  { to: "/categorias", label: "Categorias" },
  { to: "/centros-de-custo", label: "Centros de custo" },
  { to: "/clientes", label: "Clientes" },
  { to: "/usuarios", label: "Usuários" },
  { to: "/notificacoes", label: "Notificações" },
];

export function MorePage() {
  const isMobile = useIsMobile();
  const isAdmin = useIsAdmin();
  const logout = useLogout();
  const { data: accounts } = useBankAccounts();

  // No desktop tudo daqui já está na sidebar; a rota só existe no mobile.
  if (!isMobile) {
    return <Navigate to="/painel" replace />;
  }

  const active = accounts?.filter((account) => !account.archivedAt) ?? [];
  const total = active.reduce((sum, account) => sum + account.balanceCents, 0);

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => window.location.assign("/login") });
  }

  return (
    <div className="more-page">
      <div className="card">
        <div className="card-header">Saldos</div>
        <div className="more-balances">
          {active.map((account) => (
            <div className="more-balance-row" key={account.id}>
              <span>{account.name}</span>
              <b className="money">{formatBRLNumber(account.balanceCents)}</b>
            </div>
          ))}
          <div className="more-balance-row total">
            <span>Total</span>
            <b className="money">{formatBRLNumber(total)}</b>
          </div>
        </div>
      </div>

      <div className="card">
        <nav className="more-links" aria-label="Mais seções">
          {LINKS_GERAL.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-header">Administração</div>
          <nav className="more-links" aria-label="Administração">
            {LINKS_ADMIN.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <button type="button" className="btn-secondary more-logout" onClick={handleLogout} disabled={logout.isPending}>
        Sair da conta
      </button>
    </div>
  );
}
