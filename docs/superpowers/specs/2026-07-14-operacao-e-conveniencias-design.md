# Spec: Operação (backup, aviso de queda, CI, higiene) e conveniências (busca, dark mode, exports, atalho PWA)

Data: 2026-07-14
Status: aprovada (usuário delegou as decisões em sessão: "pode fazer todos menos o domínio fixo")
Baseline: `origin/main` pós-deploy de 2026-07-13

## Escopo

Itens do backlog aprovados: backup automático do banco, aviso de queda/monitoramento,
CI no GitHub, higiene (.npmrc e npm audit), busca por texto nos lançamentos, modo
escuro, exportação de lançamentos/extrato, atalho PWA de novo lançamento e a decisão
sobre o WhatsApp. Fora de escopo: domínio fixo (item 2, aguarda eu.org).

## 1. Backup automático do banco (Mac mini)

- Script versionado `deploy/backup-fluxo-db.sh`: usa `sqlite3 prod.db ".backup ..."`
  (cópia consistente com o app rodando), comprime com gzip e grava em dois destinos:
  `~/Backups/fluxo-de-caixa/` (disco local) e
  `~/Library/Mobile Documents/com~apple~CloudDocs/Backups/fluxo-de-caixa/` (iCloud,
  confirmado montado). Retenção: apaga backups com mais de 30 dias em ambos.
- LaunchAgent versionado `deploy/com.fluxocaixa.backup.plist`: roda diariamente às
  03:30. Instalação documentada no `deploy/README.md` e executada via SSH.

## 2. Aviso de queda + autocura do webhook (Mac mini)

- Script versionado `deploy/healthcheck-fluxo.sh` + LaunchAgent
  `deploy/com.fluxocaixa.healthcheck.plist` a cada 10 minutos:
  1. `curl` no `http://localhost:3333/health`. Notifica via Bot API do Telegram só
     nas transições (ok→fora e fora→ok), guardando o último estado em arquivo, sem spam.
  2. Compara a URL atual do túnel (`tunnel.log`) com a última conhecida; se mudou,
     reaponta o webhook do Telegram automaticamente (`setWebhook` via curl) e avisa
     no chat a URL pública nova.
- Destinatário: os `telegramChatId` não nulos da tabela `Organization` (hoje, Triari),
  lidos via `sqlite3` na hora do envio. Token/secret lidos do plist do app via
  PlistBuddy; nenhum segredo novo é criado ou versionado.

## 3. CI no GitHub

- `.github/workflows/ci.yml`: em push/PR para main, roda `npm ci`, `npm run typecheck`,
  `npm test` e `npm run build` com Node 22. Sem deploy automático (deploy continua manual).

## 4. Higiene de dependências

- `.npmrc`: remover a linha inválida `omit=` (warning em todo comando npm).
- `npm audit fix` para o dompurify (moderate, fix disponível).
- `xlsx`: o pacote do registro npm está parado em 0.18.5 com 1 high (prototype
  pollution + ReDoS), sem fix no registro. Plano original era o tarball oficial do
  SheetJS, mas o cdn.sheetjs.com responde 403 desta rede. Análise de risco: as duas
  CVEs estão nos caminhos de LEITURA de planilhas; o app só ESCREVE xlsx (a
  importação é OFX, parser próprio), então o high é inexplorável neste uso. Decisão:
  mantém 0.18.5, com este registro como justificativa. Se o CDN voltar a responder,
  trocar pelo tarball 0.20.2+.
- Avisos residuais de `@prisma/dev` (moderate, tooling de dev) ficam documentados;
  não bloqueiam nada em produção.

## 5. Busca por texto nos lançamentos

- Campo "Buscar" na toolbar de A pagar/A receber, filtrando client-side a lista já
  carregada do mês por descrição e contraparte (case/acento-insensível). Sem mudança
  de API ou schema. Funciona na tabela (desktop) e nos cards (mobile). O total do
  rodapé reflete o filtro aplicado.

## 6. Modo escuro

- Tokens dark em `tokens.css`: tema segue o sistema via `prefers-color-scheme` e
  pode ser forçado com `data-theme="light" | "dark"` no `<html>`.
- Preferência manual (auto/claro/escuro) persistida em `localStorage`, exposta como
  seletor na página Mais (mobile) e no rodapé da sidebar (desktop).
- Semânticos (verde/vermelho/âmbar) ganham variantes dark legíveis; sidebar/topbar
  continuam azul-marinho nos dois temas; gráfico e chips já consomem tokens.
- `theme-color` do manifest permanece o azul-marinho (vale nos dois temas).

## 7. Exportação de lançamentos e extrato

- A pagar/A receber: botão "Exportar" (PDF e Excel) exportando a lista filtrada do
  mês visível, com total. Extrato de conta: idem para o período filtrado, com saldos
  inicial/final.
- Reusa o padrão de `lib/export.ts` (import dinâmico de jspdf/xlsx) e o
  `ExportDropdown` existente da ReportsPage, extraído para componente compartilhado.

## 8. Atalho PWA

- `shortcuts` no manifest (vite.config): "Novo lançamento" abrindo
  `/a-pagar?novo=1`. A EntriesPage abre o modal de novo lançamento quando `novo=1`
  e remove o parâmetro da URL.

## 9. Decisão: WhatsApp

- O código de lembretes por WhatsApp permanece no repo e desativado
  (`WHATSAPP_ENABLED` != true). Removê-lo economizaria o peso do puppeteer no
  `npm ci`, mas apagaria funcionalidade pronta e testada que pode ser ligada por
  env var. Reversível e sem custo em runtime; fica.

## O que não muda

- Nenhuma migration nem mudança de schema. Nenhuma rota de API nova ou alterada.
- Autenticação, CRUD, dashboard, relatórios, bots: comportamento intacto.
- Túnel e forma de exposição intactos (domínio fixo fica pra quando o eu.org sair).

## Verificação

- `npm run typecheck`, `npm test`, `npm run build` verdes.
- Smoke com navegador headless nas duas larguras e nos dois temas; exportações
  PDF/Excel baixando após a troca do xlsx; busca filtrando; atalho abrindo o modal.
- No Mac mini: rodar backup e healthcheck manualmente uma vez e conferir resultado
  (arquivo criado nos dois destinos; mensagem de teste no Telegram) antes de agendar.
- CI verde no GitHub no primeiro push.
