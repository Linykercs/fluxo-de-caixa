# Plano: App de Fluxo de Caixa

Spec: docs/superpowers/specs/2026-06-12-fluxo-de-caixa-design.md

Ordem geral: monorepo/tooling → schema+seed → regras de negócio com testes → rotas+auth → frontend (consumindo a API real) → documentação. Cada fase termina verde (testes passando, app rodando) e é commitada/pushada.

## Fase 1: Monorepo e tooling
Objetivo: esqueleto dos três workspaces compilando e testável, servidor "olá" no ar.
Tarefas:
- [ ] Raiz com npm workspaces (`server`, `web`, `shared`) + TypeScript configurado nos três — pronto quando: `npm install` na raiz resolve tudo sem erro
- [ ] `/shared` com um schema zod de exemplo exportado e importado pelo server — pronto quando: `tsc --noEmit` passa nos três workspaces
- [ ] `/server` com Fastify + `GET /health` e config central (`lib/config.ts` com timezone America/Sao_Paulo e moeda BRL) — pronto quando: `npm run dev -w server` responde `{ status: "ok" }` em /health
- [ ] Vitest configurado no server com um teste trivial — pronto quando: `npm test -w server` passa
- [ ] `/web` com Vite + React + Router e página placeholder — pronto quando: `npm run dev -w web` abre no navegador
Verificar: `npm install` + os três comandos acima sem erro.

## Fase 2: Schema, migrations e seed
Objetivo: banco SQLite com o modelo completo do spec e dados realistas.
Tarefas:
- [ ] `schema.prisma` com Organization, User, BankAccount, Category, Entry, Settlement, Recurrence, Movement, Transfer — todos os campos da seção 4 do spec, enums e relações — pronto quando: `prisma migrate dev` cria o banco sem warnings
- [ ] Índices nos eixos de consulta (organizationId, competenceMonth, dueDate, bankAccountId) — pronto quando: presentes na migration
- [ ] `seed.ts` conforme seção 9 do spec: 1 org, 2 users (senha argon2), 2 contas, ~8 categorias, ~6 meses de entries (pagas, vencidas, parciais, 1 estorno, parcelamento 6x, 2 recorrências, 1 transferência) — pronto quando: `prisma db seed` roda idempotente
- [ ] Conferência manual dos dados com `prisma studio` — pronto quando: amostra confere com o spec
Verificar: `npx prisma migrate reset --force` (migra + seeda do zero) termina sem erro.

## Fase 3: Núcleo de dinheiro — baixa, estorno, parcelas (com testes)
Objetivo: as regras financeiras centrais, puras e testadas, antes de qualquer rota.
Tarefas:
- [ ] `lib/dates.ts`: hoje/comparações em America/Sao_Paulo, parse de competenceMonth — pronto quando: testes de fuso passam (vence "hoje" não é vencida; virada de dia UTC)
- [ ] Cálculo de derivados da Entry (settledCents, remainingCents, status) — pronto quando: testes de OPEN/SETTLED/OVERDUE e parciais passam
- [ ] `settleEntry` em transação atômica (Settlement + Movement, sinal por direção, validações 422) — pronto quando: testes de baixa total, parcial, valor excedente e conta arquivada passam
- [ ] `reverseSettlement` (settlement negativa vinculada + movement oposto; dupla reversão bloqueada) — pronto quando: testes de estorno e saldo restaurado passam
- [ ] `createInstallments` com resto na última parcela — pronto quando: teste de Σ parcelas = total exato passa (casos com resto)
- [ ] Saldo derivado da conta bancária (inicial + Σ movements) — pronto quando: teste com baixas + estorno confere o saldo
Verificar: `npm test -w server` verde; teste de integração criar→baixar→saldo→estornar→saldo restaurado passa.

## Fase 4: Recorrência, transferência e edição (com testes)
Objetivo: completar as regras de negócio restantes do spec.
Tarefas:
- [x] `createRecurrence` + `ensureHorizon` (12 meses rolantes, idempotente, dueDay com meses curtos) — pronto quando: testes de materialização e idempotência passam
- [x] `updateRecurrence` com escopos `only_this` / `this_and_future` (pagas intocadas) — pronto quando: testes de cada escopo passam
- [x] `cancelRecurrence` (soft delete das futuras em aberto) — pronto quando: teste passa
- [x] `createTransfer` (2 movements atômicos) — pronto quando: teste de soma zero entre contas passa
- [x] Regras de edição/exclusão de Entry (travas com baixa ativa, soft delete só sem baixas) — pronto quando: testes dos casos permitidos/bloqueados passam
Verificar: `npm test -w server` verde.

## Fase 5: Relatórios e dashboard (com testes)
Objetivo: as agregações previsto x realizado, projeção e alertas.
Tarefas:
- [x] `cashFlowReport` (previsto por competência x realizado por settledAt, 12 meses) — pronto quando: teste "competência junho paga em julho" passa
- [x] `byCategoryReport` (mês, dois eixos lado a lado) — pronto quando: teste com categorias mistas passa
- [x] `projectionReport` (saldo acumulado por dueDate; vencidas no primeiro mês) — pronto quando: testes passam
- [x] `dashboard` (saldos por conta, totais do mês, alertas vencidas/hoje/7 dias, projeção 6 meses) — pronto quando: teste sobre o seed confere os números
Verificar: `npm test -w server` verde.

## Fase 6: Auth e rotas HTTP (com integração)
Objetivo: API completa do spec, protegida e validada na borda.
Tarefas:
- [x] Auth: login/logout/me com argon2 + JWT em cookie httpOnly, middleware global — pronto quando: rota sem cookie recebe 401; login com seed funciona
- [x] Schemas zod em `/shared` para todos os payloads + tratador de erros (400 campo / 422 código / 500 genérico) — pronto quando: payload inválido retorna 400 apontando o campo
- [x] Rotas de entries: GET /payables, /receivables (filtros), POST (single/installments/recurrence), GET/PATCH/DELETE /entries/:id, PATCH /entries/:id/recurrence-scope — pronto quando: testes de integração HTTP passam
- [x] Rotas de ações: POST /entries/:id/settle, POST /settlements/:id/reverse, POST /transfers — pronto quando: fluxo crítico via HTTP passa
- [x] Rotas de apoio: bank-accounts (+statement), categories, dashboard, reports/* — pronto quando: testes de integração passam
- [x] CORS/cookies configurados para o dev do Vite — pronto quando: fetch autenticado do web em dev funciona
Verificar: `npm test -w server` verde; smoke manual com curl/cliente HTTP contra o seed.

## Fase 7: Frontend — fundação, login e painel
Objetivo: app navegável com o layout aprovado (Opção B) e painel real.
Tarefas:
- [x] Design tokens + layout com sidebar (navegação, saldos por conta ao vivo) responsivo — pronto quando: confere com o mockup aprovado
- [x] Client da API (fetch + TanStack Query) com tipos de `/shared` e tratamento de 401→login — pronto quando: /auth/me alimenta o estado de sessão
- [x] Tela de login — pronto quando: login com usuário do seed redireciona ao painel; erro mostra mensagem
- [x] Painel: régua de saldos, card de atenção, projeção 6 meses, navegação de mês — pronto quando: números batem com o seed conferido via API
- [x] Formatação BRL central (centavos → R$ 1.234,56) + input com máscara de moeda — pronto quando: usados no painel e prontos para os formulários
Verificar: login → painel com dados reais do seed, sem erros no console.

## Fase 8: Frontend — a pagar e a receber
Objetivo: o ciclo completo de lançamento e baixa pela interface.
Tarefas:
- [x] Tabelas gêmeas com filtros (mês, status, categoria, conta) e chips de status — pronto quando: filtros refletem a API
- [x] Modal "Novo lançamento" com abas Único / Parcelado / Recorrente (react-hook-form + zod de /shared) — pronto quando: os três tipos criam e aparecem na tabela
- [x] Modal de baixa (valor restante pré-preenchido, parcial permitido, data, conta) — pronto quando: baixa atualiza tabela, painel e saldo da sidebar
- [x] Detalhe da entry: histórico de baixas + estorno — pronto quando: estorno reabre a conta e restaura o saldo na tela
- [x] Edição (campos travados conforme status) e exclusão com confirmação — pronto quando: travas espelham os 422 da API
- [x] Edição de recorrência com escolha "só esta / esta e futuras" — pronto quando: os dois escopos funcionam pela UI
Verificar: fluxo manual completo: criar → baixar parcial → baixar resto → estornar → corrigir → excluir.

## Fase 9: Frontend — contas, transferências, categorias e relatórios
Objetivo: telas restantes do spec.
Tarefas:
- [x] Contas bancárias: cards com saldo derivado + cadastro/arquivamento — pronto quando: nova conta aparece na sidebar
- [x] Extrato de movimentações com saldo corrente e filtro de período — pronto quando: confere com a API
- [x] Modal de transferência entre contas — pronto quando: os dois extratos e a sidebar refletem
- [x] Categorias: CRUD com tipo e arquivamento — pronto quando: categoria nova aparece nos formulários de lançamento
- [x] Relatórios: fluxo mensal previsto x realizado (ano) + resumo por categoria do mês — pronto quando: números batem com os endpoints
Verificar: navegação completa por todas as telas com o seed, responsivo em tela estreita.

## Fase 10: Documentação e fechamento
Objetivo: qualquer pessoa clona e roda.
Tarefas:
- [x] README raiz: pré-requisitos, instalação, migrate+seed, rodar server+web, usuários de teste, como rodar os testes — pronto quando: seguível do zero
- [x] Documentação da API em `server/README.md` (endpoints, payloads, códigos de erro) — pronto quando: cobre todas as rotas do spec
- [x] Passada final: lint/tsc limpos nos três workspaces, `prisma migrate reset` + suíte completa verde — pronto quando: tudo verde em sequência única
Verificar: simulação de clone limpo (install → reset → testes → dev) sem passos não documentados.
