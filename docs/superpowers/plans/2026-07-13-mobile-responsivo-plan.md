# Plan: Responsividade mobile real, refinamento visual e performance

Spec: docs/superpowers/specs/2026-07-13-mobile-azul-pwa-design.md
Baseline: `origin/main` (`c8fb59f`)

Regras de execução: cada fase termina verde (typecheck + testes + app rodando) e vira
commit próprio. Se a realidade contradisser o plano, parar e alinhar com o usuário antes
de desviar. Nada de mudança em `server/` ou `shared/`.

## Fase 1: Baseline verde local

Goal: confirmar que o ambiente local reproduz o estado de produção antes de tocar em código.

Tasks:
- [ ] `npm ci` na raiz — done when: instala sem erro nos 3 workspaces.
- [ ] `npm run typecheck` e `npm test` — done when: ambos verdes sem modificação.
- [ ] `npm run build` com registro dos tamanhos de chunk atuais — done when: build verde
      e tamanho do chunk principal anotado (esperado ~1.4MB) para comparação na Fase 2.
- [ ] `npm run dev:server` + `dev:web` com smoke de login/painel — done when: app abre e
      loga em dev (banco dev local, nunca o de produção).

Verify: comandos acima verdes; nenhum arquivo modificado.

## Fase 2: Code-splitting

Goal: derrubar o chunk inicial de ~1.4MB para menos de ~300KB sem mudança de comportamento.

Tasks:
- [ ] Rotas com `React.lazy` + `Suspense` no `App.tsx` (fallback simples) — done when:
      cada página vira chunk próprio no output do build.
- [ ] `lib/export.ts` com `import()` dinâmico de jspdf/jspdf-autotable/xlsx — done when:
      essas libs saem do chunk inicial e exportar PDF/Excel segue funcionando em dev.
- [ ] `CashFlowChart` (recharts) com `React.lazy` no Painel — done when: recharts vira
      chunk sob demanda e o gráfico renderiza no Painel.

Verify: `npm run build` mostra chunk inicial <300KB; smoke em dev: navegar por todas as
páginas, exportar PDF e Excel, ver o gráfico. `npm run typecheck` verde.

## Fase 3: Fundações visuais

Goal: neutros azuis, escala tipográfica única e fontes self-hosted, sem mudar layout.

Tasks:
- [ ] Tokens neutros com viés azul em `tokens.css` (`--bg #f4f5f7`, `--line #dce1e8`,
      `--ink #101720`, `--ink-soft #566271`) — done when: nenhuma tela com cinza esverdeado.
- [ ] Migrar cores hard-coded da era verde (`#f8faf8`, `#c4d0c8`, `#bbf7d0`,
      `rgba(74,222,128,…)`, sombras esverdeadas) para tokens/equivalentes azuis — done
      when: `grep` não encontra mais esses valores em `web/src`.
- [ ] Escala tipográfica de 6 degraus aplicada em `layout.css`/`global.css` (h2 20px,
      card/modal 15px, corpo 14px, tabela 13px, secundário 12px, labels 11px) — done when:
      tamanhos fora da escala zerados (exceto saldo 22px).
- [ ] Fontes self-hosted via `@fontsource/dm-sans` e `@fontsource/dm-mono`, removendo
      Google Fonts do `index.html` — done when: app renderiza DM Sans/Mono sem nenhuma
      requisição a fonts.googleapis.com (conferir na aba Network).
- [ ] Foco visível: substituir `outline: none` por indicação de foco em `--accent` em
      inputs, botões, links e linhas clicáveis — done when: Tab percorre a UI com foco
      sempre visível.

Verify: smoke visual em dev (desktop): painel, listas, modais, relatórios; typecheck verde.

## Fase 4: Estrutura de navegação mobile

Goal: no viewport ≤900px, topbar + bottom nav + página Mais substituem a sidebar.

Tasks:
- [ ] Subir breakpoint de 860px para 900px e remover o CSS de sidebar-vira-pills — done
      when: não existe mais regra de pills no CSS.
- [ ] Topbar mobile fixa (logo, título da tela, controles de mês quando a tela tiver) —
      done when: presente em todas as telas no mobile, ausente no desktop.
- [ ] `BottomNav` (Painel, A pagar, A receber, Relatórios, Mais) com ícones SVG inline,
      estado ativo, `safe-area-inset-bottom` — done when: navegação funciona nas 5 abas
      com item ativo correto.
- [ ] Página `/mais` (`MorePage.tsx`): saldos + total, Orçamentos, Minha conta, seção
      admin condicional, Sair; redirect para `/painel` no desktop — done when: todos os
      destinos navegáveis e admin oculto para operador.
- [ ] FAB "+" em A pagar/A receber no mobile, ocultando o botão da toolbar — done when:
      FAB abre o modal de novo lançamento e não cobre conteúdo (respeita bottom nav).

Verify: dev em viewport 390×844 (DevTools): navegar pelas 5 abas, criar lançamento pelo
FAB, logar como operador e conferir o "Mais" sem admin. Desktop >900px: sidebar intacta.

## Fase 5: Listas em card e matrizes

Goal: nenhuma tela de lista exige scroll horizontal no mobile; matrizes rolam com
primeira coluna sticky.

Tasks:
- [ ] Padrão de card responsivo (CSS + marcação nas páginas de lista): A pagar/A receber
      primeiro (com rodapé de total) — done when: no mobile a tabela some e os cards
      mostram descrição, metadados, valor e chip, com clique abrindo o detalhe.
- [ ] Aplicar o padrão a Contas, Categorias, Centros de custo, Clientes, Usuários,
      Orçamentos e Notificações — done when: nenhuma dessas telas mostra `<table>`
      espremida no mobile.
- [ ] Matrizes (Relatórios DRE/por obra, conciliação de Importar extrato) com
      `.table-scroll` + primeira coluna sticky — done when: dá pra ler a matriz rolando
      horizontal com o rótulo da linha sempre visível.

Verify: dev em viewport mobile: percorrer todas as telas de lista e relatórios; sem
scroll horizontal de página em nenhuma; desktop inalterado. Typecheck verde.

## Fase 6: Toque, formulários e modais

Goal: usar o app no celular sem erro de toque nem zoom indesejado.

Tasks:
- [ ] Alvos mínimos de 44×44px (botões, mês, itens de nav, fechar modal, cards) — done
      when: auditoria com DevTools não acha alvo interativo menor no mobile.
- [ ] Inputs/selects com `font-size: 16px` no mobile; `inputmode="decimal"` no
      CurrencyInput; `type`/`inputmode` corretos em data e e-mail — done when: focar
      campos no iOS simulado não dá zoom e teclado certo aparece.
- [ ] Modais em tela cheia no mobile (100dvh, header fixo, corpo rolável, botões em
      coluna com primário por último) — done when: todos os modais usáveis com teclado
      virtual aberto.
- [ ] Modal acessível: Escape fecha, foco inicial e preso, `role="dialog"`,
      `aria-modal`, `aria-label` nos botões só-ícone — done when: navegável só por teclado.

Verify: dev mobile: criar, editar, baixar e estornar lançamento; transferência; filtros.
Desktop: modais centralizados como antes. Typecheck verde.

## Fase 7: Estados de UI e polish

Goal: estados vazio/erro consistentes e microdetalhes fechados.

Tasks:
- [ ] Estados vazio/erro padronizados nas telas de lista (vazio com convite à ação, erro
      com o que falhou e como tentar de novo) — done when: as telas de lista usam o
      padrão comum em vez de texto improvisado.
- [ ] Novas transições usando `--duration-*` (reduced motion já cobre) — done when:
      nenhuma transição nova com duração hard-coded.
- [ ] Revisão visual final nas duas larguras com screenshot/side-by-side — done when:
      sem regressão visual aparente em nenhuma tela.

Verify: smoke completo em dev nas duas larguras.

## Fase 8: Verificação final

Goal: tudo verde e commitado antes de qualquer deploy.

Tasks:
- [ ] `npm run typecheck`, `npm test`, `npm run build` na raiz — done when: os três
      verdes, chunk inicial <300KB confirmado.
- [ ] Smoke final em dev: login, painel, CRUD de lançamento com baixa/estorno,
      relatórios, exportações, telas admin, instalação PWA (manifest ok no DevTools) —
      done when: roteiro completo sem erro.
- [ ] Push de todos os commits para `origin/main` — done when: `git status` limpo e
      GitHub atualizado.

Verify: comandos acima; histórico de commits com uma fase por commit.

## Fase 9: Deploy no Mac mini

Goal: produção atualizada sem downtime relevante e sem tocar no túnel.

Tasks:
- [ ] SSH `Servidor@100.65.77.118`; backup `cp server/prisma/prod.db
      server/prisma/prod.db.backup-$(date +%Y%m%d%H%M%S)` — done when: arquivo de backup
      existe com tamanho > 0.
- [ ] `git status` no Mac mini — done when: working tree limpo (se houver diff local,
      parar e revisar com o usuário antes de qualquer pull).
- [ ] `git pull`, `npm ci`, `npm run build`, `npm run db:migrate` (no-op esperado) —
      done when: todos sem erro.
- [ ] `launchctl unload` + `load` de `com.servidor.fluxo-de-caixa` (não tocar no túnel) —
      done when: `launchctl list | grep servidor.fluxo` mostra o serviço de volta.
- [ ] Pós-verificação: URL pública atual responde, login ok, saldos corretos, bot do
      Telegram responde, PWA instalável — done when: roteiro completo sem erro.

Verify: app em produção com as melhorias, mesma URL do túnel de antes.
