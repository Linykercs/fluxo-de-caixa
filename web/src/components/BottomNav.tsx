import { NavLink, useLocation } from "react-router-dom";

// Rotas agrupadas pela aba "Mais": tudo que não tem aba própria na bottom nav.
const MORE_ROUTES = [
  "/mais",
  "/orcamentos",
  "/meu-perfil",
  "/contas",
  "/importar-extrato",
  "/categorias",
  "/centros-de-custo",
  "/clientes",
  "/usuarios",
  "/notificacoes",
];

function IconPainel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function IconPagar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v13" />
      <path d="M6 11l6 6 6-6" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconReceber() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20V7" />
      <path d="M6 13l6-6 6 6" />
      <path d="M5 3h14" />
    </svg>
  );
}

function IconRelatorios() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
}

function IconMais() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

const ITEMS = [
  { to: "/painel", label: "Painel", icon: <IconPainel /> },
  { to: "/a-pagar", label: "A pagar", icon: <IconPagar /> },
  { to: "/a-receber", label: "A receber", icon: <IconReceber /> },
  { to: "/relatorios", label: "Relatórios", icon: <IconRelatorios /> },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const moreActive = MORE_ROUTES.some((route) => pathname.startsWith(route));

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? "bn-item active" : "bn-item")}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
      <NavLink to="/mais" className={moreActive ? "bn-item active" : "bn-item"}>
        <IconMais />
        <span>Mais</span>
      </NavLink>
    </nav>
  );
}
