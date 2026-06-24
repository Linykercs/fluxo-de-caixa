# Plan: Perfis de Acesso — Admin e Operador
Spec: docs/superpowers/specs/2026-06-16-perfis-de-acesso-design.md

---

## Phase 1: Migration + schema + JWT

**Goal:** campo `role` no banco e no token JWT, sem quebrar nada existente.

Tasks:
- [ ] 1.1 — Adicionar `role String @default("ADMIN")` ao modelo `User` em `server/prisma/schema.prisma` — done when: arquivo salvo com o campo
- [ ] 1.2 — Criar migration `server/prisma/migrations/20260616120000_add_user_role/migration.sql` com `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN'` — done when: arquivo existe
- [ ] 1.3 — Regenerar Prisma client: `npm run postinstall -w server` (ou `npx prisma generate`) — done when: `server/src/generated/prisma` contém `role` no tipo `User`
- [ ] 1.4 — Adicionar `role: string` ao payload do JWT em `server/src/types/fastify.d.ts` — done when: typecheck passa
- [ ] 1.5 — Incluir `role: user.role` no `app.jwt.sign(...)` de `/auth/login` e na resposta de `/auth/me` em `server/src/routes/auth.ts` — done when: login retorna role no cookie e `/auth/me` retorna `role`
- [ ] 1.6 — Adicionar `role` ao `createUserSchema` em `shared/src/schemas/users.ts`: `role: z.enum(["ADMIN", "OPERATOR"]).default("OPERATOR")` — done when: typecheck shared passa
- [ ] 1.7 — Adicionar `changeUserRoleSchema` em `shared/src/schemas/users.ts`: `z.object({ role: z.enum(["ADMIN","OPERATOR"]) })` — done when: schema exportado de shared/src/index.ts

Verify: `npm run typecheck && npm test -w server` — todos os 182 testes existentes ainda verdes

---

## Phase 2: Backend — requireAdmin + rotas protegidas + nova rota

**Goal:** endpoints admin-only retornam 403 para operadores; nova rota `PATCH /users/:id/role`.

Tasks:
- [ ] 2.1 — Criar `server/src/lib/auth.ts` com `assertAdmin(request)`: lança `BusinessError("FORBIDDEN", ...)` se `request.user.role !== "ADMIN"` — done when: arquivo compila
- [ ] 2.2 — Aplicar `assertAdmin(request)` no início das mutações admin-only em `categories.ts` (POST, PATCH), `cost-centers.ts` (POST, PATCH), `bank-accounts.ts` (POST, PATCH), `bank-import.ts` (POST confirm), `reports.ts` (POST close-period), `users.ts` (POST /users) — done when: typecheck passa
- [ ] 2.3 — Adicionar `changeUserRole(db, organizationId, actorId, targetId, role)` em `server/src/services/users.ts`: valida mesma org, proíbe mudar o próprio role, retorna usuário atualizado com `role` — done when: função compila
- [ ] 2.4 — Adicionar `PATCH /users/:id/role` em `server/src/routes/users.ts` com `assertAdmin` + `changeUserRole` — done when: rota registrada e typecheck passa
- [ ] 2.5 — Atualizar `createUser` service para persistir `input.role` (default OPERATOR) — done when: campo `role` salvo no `db.user.create`
- [ ] 2.6 — Expor `role` nos selects de `listUsers` e `createUser` — done when: respostas incluem `role`
- [ ] 2.7 — Escrever `server/test/http/roles.test.ts`: criar user OPERATOR via prisma direto, fazer login como operador, verificar 403 em POST /categories e POST /users; verificar 200 em GET /categories; testar PATCH /users/:id/role (sucesso + erro de mudar próprio role) — done when: `npm test -w server` passa com novos testes

Verify: `npm run typecheck && npm test -w server` — tudo verde incluindo novos testes de roles

---

## Phase 3: Frontend — guards, sidebar e UsersPage

**Goal:** operadores veem tudo mas não acessam funções admin; admin gerencia roles na tela de usuários.

Tasks:
- [ ] 3.1 — Adicionar `role: "ADMIN" | "OPERATOR"` ao tipo `Me` em `web/src/api/types.ts`; adicionar `role` ao tipo `UserSummary` — done when: typecheck web passa
- [ ] 3.2 — Criar `useIsAdmin()` em `web/src/api/auth.ts`: retorna `me?.role === "ADMIN"` — done when: hook exportado
- [ ] 3.3 — Criar `web/src/components/RequireAdmin.tsx`: renderiza `<Navigate to="/painel" replace />` se não for admin, senão renderiza `<Outlet />` — done when: componente compila
- [ ] 3.4 — Envolver rotas admin-only em `App.tsx` com `<RequireAdmin>`: `/categorias`, `/centros-de-custo`, `/contas`, `/importar-extrato`, `/usuarios` — done when: typecheck passa
- [ ] 3.5 — `Sidebar.tsx`: filtrar NAV_ITEMS admin-only com `useIsAdmin()` — done when: links ocultos para operador
- [ ] 3.6 — `ReportsPage.tsx`: ocultar botão "Fechar mês" se `!isAdmin` — done when: operador não vê o botão
- [ ] 3.7 — Adicionar `useChangeUserRole()` mutation em `web/src/api/users.ts`: chama `PATCH /users/:id/role`, invalida query `["users"]` — done when: hook tipado
- [ ] 3.8 — `UsersPage.tsx`: adicionar `<select>` de role no formulário de criar; adicionar coluna "Perfil" e botão "Tornar admin"/"Tornar operador" na lista (não mostra na linha do próprio usuário) — done when: admin vê e pode usar os controles; typecheck passa

Verify: `npm run typecheck` — tudo verde; dev server sobe sem erros; manual: logar como OPERATOR → sidebar sem itens admin, `/categorias` redireciona para painel, botão "Fechar mês" ausente

---

## Commit strategy

- `feat(server): add user role field, migration, and admin-only route guards`
- `feat(web): role-based access control - sidebar, route guards, user management`

Push para main → Railway aplica a migration automaticamente ao subir (`npm run db:migrate -w server` no start ou via `apply-migrations.ts`).

> **Nota Railway**: a migration `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN'` é não-destrutiva e idempotente — adiciona coluna com valor default, sem remover dados.
