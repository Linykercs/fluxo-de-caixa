import { useLocation } from "react-router-dom";

// Título por prefixo de rota (primeiro match ganha; mais específico primeiro).
const TITLES: Array<{ prefix: string; label: string }> = [
  { prefix: "/painel", label: "Painel" },
  { prefix: "/a-pagar", label: "A pagar" },
  { prefix: "/a-receber", label: "A receber" },
  { prefix: "/orcamentos", label: "Orçamentos" },
  { prefix: "/relatorios", label: "Relatórios" },
  { prefix: "/meu-perfil", label: "Minha conta" },
  { prefix: "/contas", label: "Contas bancárias" },
  { prefix: "/importar-extrato", label: "Importar extrato" },
  { prefix: "/categorias", label: "Categorias" },
  { prefix: "/centros-de-custo", label: "Centros de custo" },
  { prefix: "/clientes", label: "Clientes" },
  { prefix: "/usuarios", label: "Usuários" },
  { prefix: "/notificacoes", label: "Notificações" },
  { prefix: "/mais", label: "Mais" },
];

export function MobileTopbar() {
  const { pathname } = useLocation();
  const title = TITLES.find((t) => pathname.startsWith(t.prefix))?.label ?? "FluxoCaixa";

  return (
    <header className="mobile-topbar">
      <img src="/logo.svg" alt="" className="brand-logo" />
      <h1>{title}</h1>
    </header>
  );
}
