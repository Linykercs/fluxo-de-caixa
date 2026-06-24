# Fluxo de Caixa

Aplicativo web de fluxo de caixa para controle financeiro de uma pequena empresa: contas a pagar e a receber, saldo bancário derivado de movimentações, painel mensal (previsto x realizado) e relatórios.

Monorepo com três workspaces npm:

- **`server`** — API Fastify + Prisma + SQLite (TypeScript). Documentação completa da API em [`server/README.md`](server/README.md).
- **`web`** — frontend React + Vite (TypeScript).
- **`shared`** — schemas zod e tipos compartilhados entre `server` e `web`.

## Pré-requisitos

- Node.js 20 ou superior
- npm 10 ou superior (instalado junto com o Node)

## Instalação

Na raiz do projeto:

```bash
npm install
```

Isso resolve as dependências dos três workspaces e roda `prisma generate` automaticamente (script `postinstall` do workspace `server`).

## Configuração de ambiente

Copie o arquivo de exemplo (os valores padrão já funcionam em desenvolvimento):

```bash
cp server/.env.example server/.env
```

| Variável | Descrição | Padrão (dev) |
|---|---|---|
| `DATABASE_URL` | Caminho do banco SQLite | `file:./prisma/dev.db` |
| `JWT_SECRET` | Segredo de assinatura do cookie de sessão | `dev-secret-troque-em-producao` |
| `CORS_ORIGIN` | Origem permitida no CORS | `http://localhost:5173` |
| `PORT` | Porta da API | `3333` |
| `HOST` | Host da API | `127.0.0.1` |
| `SERVE_WEB` | Servir `web/dist` pelo backend | `false` em dev, `true` em production |
| `WEB_DIST_PATH` | Caminho do build web para o backend servir | `../web/dist` |

## Banco de dados: migrations e seed

Cria o banco SQLite, aplica as migrations e popula com dados de exemplo:

```bash
npm run db:migrate -w server
npm run db:seed -w server
```

Para recomeçar do zero (apaga e recria o banco, aplica migrations e roda o seed) em um único comando:

```bash
npm run db:reset -w server
```

O seed (`server/prisma/seed.ts`) cria 1 organização, 2 usuários, 2 contas bancárias, 8 categorias e cerca de 6 meses de lançamentos cobrindo pagos, em aberto, vencidos, baixa parcial, parcelamento (6x), recorrências, 1 estorno e 1 transferência entre contas. É idempotente: pode ser rodado várias vezes.

Para inspecionar os dados manualmente:

```bash
npm run db:studio -w server
```

## Rodando em desenvolvimento

Em dois terminais separados, a partir da raiz:

```bash
npm run dev:server   # API em http://127.0.0.1:3333
npm run dev:web      # Frontend em http://localhost:5173
```

Abra `http://localhost:5173` no navegador e faça login com um dos usuários de teste abaixo.

## Usuários de teste

Criados pelo seed (mesma senha para os dois):

| E-mail | Senha | Nome |
|---|---|---|
| `ana@empresa.com.br` | `senha123` | Ana Souza |
| `bruno@empresa.com.br` | `senha123` | Bruno Lima |

## Testes

A suíte de testes (Vitest) vive no workspace `server`:

```bash
npm test              # equivalente a: npm test -w server
```

Para rodar em modo watch durante o desenvolvimento:

```bash
npm run test:watch -w server
```

## Typecheck

Verifica os três workspaces em sequência (`shared` → `server` → `web`):

```bash
npm run typecheck
```

## Build e execucao em producao

O backend pode servir o build estatico do frontend. Assim, em producao o app roda em um unico dominio e o frontend chama a API pela mesma origem.

Fluxo minimo:

```bash
npm ci
npm run build
npm run db:migrate
NODE_ENV=production HOST=0.0.0.0 PORT=3333 npm start
```

Variaveis recomendadas estao em `server/.env.production.example`.

Para primeira carga de demonstracao:

```bash
npm run db:reset
```

Em producao real, prefira `npm run db:migrate` para preservar dados existentes.

### Banco em producao

Para uma empresa pequena, o caminho mais simples e SQLite/libSQL com arquivo em volume persistente, por exemplo:

```bash
DATABASE_URL="file:/data/fluxo.db"
```

O volume precisa ter backup/snapshot periodico. Se a operacao evoluir para varias empresas/clientes, considere migrar para um banco gerenciado compativel com libSQL/Turso ou reavaliar PostgreSQL.

## Estrutura do projeto

```
.
├── server/   # API Fastify + Prisma + SQLite (ver server/README.md)
├── web/      # Frontend React + Vite
├── shared/   # Schemas zod e tipos compartilhados
└── docs/     # Spec e plano de implementação (docs/superpowers)
```
