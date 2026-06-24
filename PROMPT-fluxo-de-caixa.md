# Prompt completo — App de Fluxo de Caixa (Claude Code)

## Antes de colar o prompt

1. Coloque as skills no projeto (Claude Code lê de `.claude/skills/` ou da pasta que seu setup de skills usa):
   - `skills/brainstorming/SKILL.md` (a que você já tem)
   - `skills/frontend-design/SKILL.md` (a que você já tem)
   - `skills/backend-design/SKILL.md` (a que eu criei)
2. Abra o Claude Code na pasta vazia do projeto e cole o prompt abaixo.

---

## PROMPT (copie daqui para baixo)

Quero construir um **aplicativo web de fluxo de caixa** para controle financeiro de uma pequena empresa. Use o skill de **brainstorming** para refinar o design comigo ANTES de qualquer implementação. Não escreva código até eu aprovar o spec.

### O que o app faz

**Lançamentos**
- Lançar **contas a pagar**: descrição/fornecedor, categoria, valor, mês de competência, data de vencimento
- Lançar **contas a receber**: descrição/cliente, categoria, valor, mês de competência, data de vencimento
- Lançamentos **recorrentes** (ex: aluguel todo mês) e **parcelados** (cada parcela com seu vencimento e sua competência)

**Regra de competência x pagamento (regra central do sistema)**
- Toda conta pertence ao **mês de competência** em que foi lançada: conta de novembro é lançada em novembro e aparece no fluxo de novembro
- A **baixa** (pagamento ou recebimento) acontece no vencimento ou na data real informada pelo usuário
- O sistema separa três datas distintas: **competência**, **vencimento** e **pagamento efetivo**
- Status: **Em aberto / Pago / Recebido / Vencido** — "Vencido" é calculado (em aberto + vencimento < hoje), não um campo editável
- Permitir **pagamento parcial** e **estorno** de uma baixa (o estorno devolve o valor ao saldo criando movimentação compensatória, nunca apagando histórico)

**Controle de saldo bancário**
- Cadastro de uma ou mais contas bancárias com saldo inicial
- Cada baixa movimenta a conta bancária escolhida; o **saldo é sempre derivado** (saldo inicial + soma das movimentações), nunca editado diretamente
- Extrato de movimentações por conta

**Painel de fluxo de caixa**
- Visão mensal: total a pagar, total a receber, saldo previsto x saldo realizado
- Projeção de saldo futuro com base nas contas em aberto e seus vencimentos
- Alertas: contas vencendo hoje / nos próximos dias, e contas vencidas
- Filtros por mês, categoria, status e conta bancária

**Relatórios**
- Fluxo de caixa mensal (previsto x realizado)
- Resumo por categoria (entradas e saídas)
- Histórico de movimentações por conta bancária

### Stack e arquitetura

- **Backend**: Node.js + TypeScript + Fastify, Prisma como ORM, banco **SQLite** (arquitetura preparada para migrar para PostgreSQL depois). Siga o skill **backend-design** em toda a implementação do servidor — em especial: dinheiro em centavos (nunca float), saldo derivado, baixa como ação (`POST /payables/:id/settle`) dentro de transação atômica, três datas separadas no modelo, validação com zod na borda, testes unitários das regras de dinheiro (arredondamento de parcelas, vencida no fuso horário do usuário).
- **Frontend**: React + TypeScript (Vite). Siga o skill **frontend-design**: visual limpo e profissional de ferramenta financeira, hierarquia clara entre saídas (a pagar) e entradas (a receber), saldo como elemento central do painel, responsivo.
- Monorepo simples: `/server` e `/web`, com seed de dados realistas (contas em vários meses, status variados, duas contas bancárias) para desenvolver o frontend com dados de verdade.

### Usuários e acesso

- Versão inicial: **uso por uma única empresa**, com login simples (e-mail + senha) para proteger os dados
- O modelo de dados deve nascer preparado para multiempresa no futuro (ex: campo de organização nas tabelas), mas SEM implementar multiempresa agora — confirme isso comigo na fase de brainstorming antes de decidir

### Processo (obrigatório)

1. Siga o fluxo do skill de brainstorming: explore o contexto, faça **uma pergunta por vez** para refinar requisitos, proponha 2–3 abordagens com prós e contras, apresente o design por seções e escreva o spec em `docs/superpowers/specs/`
2. Só depois da minha aprovação do spec, gere o plano de implementação e comece a codar
3. Backend primeiro (modelo de dados → regras de negócio com testes → rotas), frontend em seguida consumindo a API real
4. Ao final de cada etapa, me mostre como rodar e testar localmente

Pode começar pela primeira pergunta do brainstorming.

---

## (Fim do prompt)

### Dicas
- Se você já souber as respostas das perguntas que o agente vai fazer (cores/identidade visual, categorias padrão, quantas contas bancárias, etc.), pode adiantá-las no final do prompt para acelerar
- Quando o projeto crescer (multiempresa, importação de extrato OFX, Open Finance), peça um novo ciclo de brainstorming só para essa evolução — a arquitetura já vai estar pronta para receber
