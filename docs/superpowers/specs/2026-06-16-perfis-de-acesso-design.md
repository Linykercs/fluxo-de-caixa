# Spec: Perfis de Acesso — Admin e Operador

## Contexto

Sistema FluxoCaixa em produção. Atualmente todos os usuários têm acesso total. Uma das organizações reais precisa dar acesso a funcionários sem expor configurações sensíveis. Dois perfis: **ADMIN** (acesso total) e **OPERATOR** (lançamentos e consultas).

---

## 1. Modelo de dados

Campo `role TEXT NOT NULL DEFAULT 'ADMIN'` adicionado ao modelo `User`.

```prisma
model User {
  ...
  role String @default("ADMIN")  // "ADMIN" | "OPERATOR"
  ...
}
```

**Migration**: `ALTER TABLE User ADD COLUMN role TEXT NOT NULL DEFAULT 'ADMIN'` — todos os usuários existentes ficam como ADMIN.

Novos usuários criados via `createUser` recebem `OPERATOR` por padrão, salvo se o admin escolher `ADMIN` no formulário.

---

## 2. Backend

### JWT

O `role` é adicionado ao payload do JWT no login. `request.user.role` fica disponível em todas as rotas protegidas.

Stale token: se o admin rebaixa um usuário, o token antigo permanece válido até expirar (7 dias). Aceitável para este contexto.

### Middleware `requireAdmin`

Função simples adicionada em `server/src/lib/auth.ts`:

```ts
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (request.user.role !== "ADMIN") {
    throw new BusinessError("FORBIDDEN", "Acesso restrito a administradores.");
  }
}
```

Aplicada como hook inline nas rotas admin-only.

### Rotas admin-only (recebem `requireAdmin`)

| Rota | Método |
|------|--------|
| `POST /categories` | criar categoria |
| `PATCH /categories/:id` | editar categoria |
| `DELETE /categories/:id` | arquivar categoria |
| `POST /cost-centers` | criar centro de custo |
| `PATCH /cost-centers/:id` | editar centro de custo |
| `DELETE /cost-centers/:id` | arquivar centro de custo |
| `POST /bank-accounts` | criar conta bancária |
| `PATCH /bank-accounts/:id` | editar conta bancária |
| `DELETE /bank-accounts/:id` | arquivar conta bancária |
| `POST /users` | criar usuário |
| `PATCH /users/:id/role` | mudar role de usuário (nova rota) |
| `POST /bank-import/confirm` | confirmar importação de extrato |
| `POST /reports/close-period` | fechar mês |

### Nova rota `PATCH /users/:id/role`

Permite ao admin mudar o role de outro usuário da mesma organização. Não permite mudar o próprio role (retorna `FORBIDDEN`).

Schema: `z.object({ role: z.enum(["ADMIN", "OPERATOR"]) })`

### Rotas que operadores podem usar (sem mudança)

Todas as rotas GET, criar/editar/excluir lançamentos, baixar/estornar, transferências, `PATCH /users/me`.

### Schemas compartilhados

`createUserSchema` em `shared/src/schemas/users.ts` ganha campo opcional:
```ts
role: z.enum(["ADMIN", "OPERATOR"]).default("OPERATOR")
```

---

## 3. Frontend

### Tipo `Me`

```ts
interface Me {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
}
```

### Hook `useIsAdmin()`

```ts
export function useIsAdmin(): boolean {
  const { data: me } = useMe();
  return me?.role === "ADMIN";
}
```

### Sidebar

Links ocultos para operadores: "Categorias", "Centros de custo", "Contas bancárias", "Importar extrato", "Usuários".

### UsersPage

- Formulário de criar usuário: adiciona `<select>` para role (Admin / Operador), padrão Operador
- Lista de usuários: adiciona coluna "Perfil" + botão "Tornar admin" / "Tornar operador" (não aparece na linha do próprio usuário logado)
- Mutation `useChangeUserRole()` chama `PATCH /users/:id/role`

### ReportsPage

Botão "Fechar mês" fica oculto para operadores.

### Proteção de rota no frontend

`RequireAdmin` wrapper que redireciona para `/painel` se o usuário não for admin. Aplicado nas routes: `/categorias`, `/centros-de-custo`, `/contas`, `/importar-extrato`, `/usuarios`.

---

## 4. Fases de implementação

1. **Migration + modelo** — campo `role` no banco, Prisma schema, JWT payload
2. **Backend** — `requireAdmin`, rotas admin-only protegidas, nova rota `PATCH /users/:id/role`
3. **Frontend** — `useIsAdmin`, Sidebar condicional, UsersPage com role selector e botão de troca, ReportsPage sem "Fechar mês" para operadores, `RequireAdmin` route guard
