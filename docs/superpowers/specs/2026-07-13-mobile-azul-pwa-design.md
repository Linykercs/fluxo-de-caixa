# Spec: Responsividade mobile real, refinamento visual e performance

Data: 2026-07-13
Status: aprovada pelo usuário (brainstorming em sessão)
Baseline: `origin/main` em `2e492d5` (identidade azul e PWA via vite-plugin-pwa já em produção)
Escopo: apenas o workspace `web`. Nenhuma mudança em `server` ou `shared`.

## Objetivo

Tornar o FluxoCaixa confortável de usar no navegador do celular (navegação, listas, toque,
formulários), refinar tipografia e consistência visual sobre a identidade azul existente e
resolver o chunk de build de 1.4MB, sem quebrar nada que funciona em produção.

## Contexto de produção

O app roda self-hosted num Mac mini (ver `docs/deploy-mac-mini.md`), com dados reais.
Deploy manual via SSH. A URL pública é um Cloudflare Quick Tunnel que não pode ser
reiniciado nem substituído. `npm run db:reset` e `db:seed` são proibidos no servidor.

## O que o baseline já tem (não refazer)

- Identidade azul: accent `#1e4e8c`, sidebar `#0b1e33`, logo azul. Mantida como está.
- PWA instalável via `vite-plugin-pwa`: manifest, ícones 192/512/maskable, standalone,
  service worker com app shell cacheado e API fora do cache. Mantido como está.
- Bot do Telegram, lembretes WhatsApp, cobrança, Orçamentos, Clientes e Notificações
  (código versionado no repo).
- Responsividade mínima: breakpoint 860px, sidebar vira pills, `.table-scroll` com
  scroll horizontal, skeletons de carregamento.

## Decisões aprovadas

1. Navegação mobile: bottom nav fixa com 5 itens (mockup opção 1).
2. Tabelas de lista viram cards no mobile; matrizes continuam com scroll interno.
3. PWA permanece com o cache de app shell atual (dado financeiro nunca vem de cache).
4. Abordagem: adaptação por componente, sem reescrita de telas nem biblioteca de UI.

## 1. Navegação mobile

Breakpoint principal sobe de 860px para **900px**. Acima dele nada muda (sidebar,
tabelas completas, modais centralizados).

No mobile (≤900px):

- A sidebar (e o comportamento atual de pills) sai de cena.
- **Topbar fixa** azul-marinho: logo, título da tela atual e, nas telas com navegação de
  mês (Painel, A pagar, A receber, Relatórios), os controles de mês.
- **`BottomNav` novo** (`web/src/components/BottomNav.tsx`), fixo embaixo, com
  `padding-bottom: env(safe-area-inset-bottom)`: Painel, A pagar, A receber, Relatórios,
  Mais. Ícones SVG inline próprios (o desktop continua só texto). Item ativo em
  `--sidebar-accent`/`--accent` com peso 600.
- **Página "Mais"** (`/mais`, `web/src/pages/MorePage.tsx`), para qualquer usuário logado:
  1. Saldos por conta + total (o que a sidebar mostra no desktop).
  2. Orçamentos (principal no desktop, não coube nos 5 slots) e Minha conta.
  3. Seção Administração (só admins): Contas bancárias, Importar extrato, Categorias,
     Centros de custo, Clientes, Usuários, Notificações.
  4. Sair.
  No desktop, `/mais` redireciona para `/painel`. "Mais" fica ativo na bottom nav quando
  a rota atual é uma das que ele agrupa.
- **FAB "+"** (novo lançamento) nas telas A pagar e A receber no mobile; o botão
  "+ Novo lançamento" da toolbar fica oculto nesse breakpoint. Mesmo modal de hoje.

## 2. Listas em card (mobile)

Telas de lista viram cards no mobile: A pagar, A receber, Contas bancárias, Categorias,
Centros de custo, Clientes, Usuários, Orçamentos e Notificações (onde houver tabela).
Padrão do card:

- Linha 1: descrição/nome (peso 600, ellipsis) + valor em DM Mono à direita.
- Linha 2: metadados (contraparte, vencimento, categoria) + chip de status à direita.
- Card inteiro clicável, mesma ação do clique na linha da tabela.
- Linha de total (A pagar/A receber) vira rodapé fixo da lista.
- Implementação: o mesmo componente renderiza `<table>` e a lista de cards; a visibilidade
  é decidida por CSS no breakpoint. Sem duplicar lógica de dados nem chamadas.

Exceções, conteúdo genuinamente matricial, mantêm `.table-scroll` (scroll horizontal
interno) e ganham primeira coluna sticky: matrizes de Relatórios (DRE, por obra) e a
tabela de conciliação de Importar extrato. O drill-down de Relatórios continua no
`MonthDetailModal`.

## 3. Toque, formulários e modais (mobile)

- Alvos de toque mínimos de 44×44px (botões, itens de nav, cards, controles de mês).
- Inputs e selects com `font-size: 16px` no mobile (evita zoom automático do iOS).
- `inputmode="decimal"` no CurrencyInput; `type`/`inputmode` adequados em data e e-mail.
- Modais em tela cheia (100dvh) no mobile: header fixo com fechar de 44px, corpo rolável,
  rodapé com botões empilhados em coluna e ação primária por último.
- Filtros da toolbar (selects de status/categoria/etc.) empilham em largura total.

## 4. Refinamento visual (sobre o azul existente)

- **Escala tipográfica** normalizada em 6 degraus e aplicada em todo o CSS
  (hoje: 10, 11, 12, 13, 14, 15, 17, 22px soltos):

  | Papel | Tamanho |
  |---|---|
  | Título de página (`h2`) | 20px |
  | Título de card/modal | 15px |
  | Corpo, inputs, botões | 14px |
  | Texto de tabela/lista | 13px |
  | Secundário (hints, subs) | 12px |
  | Labels uppercase/eyebrows | 11px |

  Valores monetários de destaque (saldo strip) mantêm 22px DM Mono.
- **Neutros com viés azul**: os cinzas atuais são sobras da era verde
  (`--bg #f4f5f4`, `--line #dde3df`, `--ink #111a14`, `--ink-soft #586358`) e destoam da
  sidebar azul. Passam para `#f4f5f7`, `#dce1e8`, `#101720`, `#566271`. Hovers e bordas
  hard-coded verdes (`#f8faf8`, `#c4d0c8`, `#bbf7d0`, `rgba(74,222,128,…)`) migram para
  tokens/equivalentes azuis. Verde/vermelho/âmbar semânticos não mudam.
- **Fontes self-hosted**: DM Sans e DM Mono via `@fontsource/dm-sans` e
  `@fontsource/dm-mono` (única dependência nova do trabalho, só de assets), removendo os
  `<link>` do Google Fonts. Pesos: DM Sans 400/500/600/700, DM Mono 400/500. Com isso o
  app instalado abre com a fonte certa offline e sem requisição externa.

## 5. Performance (code-splitting)

- `React.lazy` + `Suspense` por rota no `App.tsx`; fallback simples de carregamento.
- `web/src/lib/export.ts`: `jspdf`, `jspdf-autotable` e `xlsx` passam a `import()`
  dinâmico dentro das funções de exportação.
- `CashFlowChart` (recharts) com `React.lazy` dentro do Painel.
- Meta: chunk inicial abaixo de ~300KB (hoje 1.4MB+), verificado no `npm run build`.
- Atenção ao precache do vite-plugin-pwa: os chunks lazy continuam no precache do service
  worker (comportamento padrão do generateSW), o que é desejado.

## 6. Acessibilidade e estados de UI

- Foco visível: substituir `outline: none` por indicação de foco em `--accent`
  (outline 2px ou box-shadow) em inputs, botões, links, linhas clicáveis e cards.
- `aria-label` em todos os botões só-ícone (fechar modal, mês, FAB).
- Modais: fechar com Escape, foco inicial e preso no modal (focus trap no componente
  `Modal` existente), `role="dialog"` e `aria-modal="true"`.
- `prefers-reduced-motion` já tem base nos tokens de movimento; garantir que novas
  transições usem `--duration-*`.
- Estados de lista padronizados: skeleton (já existe), vazio com convite à ação
  ("Nenhum lançamento neste mês. Toque em + para criar.") e erro dizendo o que falhou
  e como tentar de novo. Aplicado às telas de lista.

## 7. O que explicitamente não muda

- Nenhuma mudança em API, schema Prisma, migrations, regras de negócio ou banco.
- `server/` e `shared/` intocados.
- Identidade azul, logo, manifest e estratégia de service worker atuais.
- Comportamento de autenticação, CRUD, dashboard, relatórios, exportações, bots.
- A forma de expor o app (Quick Tunnel atual, mesma URL, serviço do túnel intocado).

## 8. Verificação

- `npm run typecheck` e `npm test` verdes na raiz.
- `npm run build` verde, com conferência do tamanho dos chunks no output.
- Smoke manual no dev server: login, painel, criar/baixar/estornar lançamento,
  relatórios, exportar PDF/Excel, telas admin; em viewport desktop e mobile (DevTools).

## 9. Deploy (Mac mini, manual)

Seguindo `docs/deploy-mac-mini.md`, via SSH (`Servidor@100.65.77.118`):

1. Backup do banco: `cp server/prisma/prod.db server/prisma/prod.db.backup-<timestamp>`.
2. Verificar que o working tree do Mac mini está limpo (`git status`); o aviso de
   2026-07-12 sobre mudanças não commitadas lá provavelmente já foi resolvido pelos
   commits que estão no remoto, mas confere antes de qualquer pull.
3. `git pull`, `npm ci`, `npm run build`, `npm run db:migrate` (no-op, sem migration nova).
4. `launchctl unload` + `load` do plist `com.servidor.fluxo-de-caixa` (apenas o app;
   o LaunchDaemon do túnel não é tocado).
5. Verificação pós-deploy: app responde na URL pública atual, login funciona, saldos
   corretos, bot do Telegram segue respondendo, instalação PWA continua ok.
