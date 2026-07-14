# Plan: Operação e conveniências

Spec: docs/superpowers/specs/2026-07-14-operacao-e-conveniencias-design.md
Baseline: origin/main pós-deploy de 2026-07-13. Aprovação delegada pelo usuário em sessão.

Regras: cada fase termina verde e vira commit próprio; desvio de plano para e realinha.

## Fase A: Higiene + CI

Goal: dependências saneadas e pipeline verde no GitHub.
Tasks:
- [ ] Remover `omit=` do .npmrc — done when: nenhum warning de config em comandos npm.
- [ ] `npm audit fix` (dompurify) — done when: moderate do dompurify some do audit.
- [ ] Trocar xlsx pro tarball oficial 0.20.3 do SheetJS — done when: audit sem high e
      export Excel funcionando em dev.
- [ ] `.github/workflows/ci.yml` (npm ci, typecheck, test, build; Node 22) — done
      when: workflow passa no GitHub após o push.
Verify: typecheck + test + build verdes local; Actions verde.

## Fase B: Busca + atalho PWA + exportações

Goal: conveniências de uso diário nas telas de lançamentos e extrato.
Tasks:
- [ ] Campo de busca client-side em A pagar/A receber (descrição + contraparte,
      sem acento/caixa) refletido em tabela, cards e total — done when: digitar filtra
      nas duas larguras.
- [ ] `?novo=1` abre o modal de novo lançamento e limpa o param — done when: URL
      direta abre o modal.
- [ ] `shortcuts` no manifest do vite-plugin-pwa — done when: manifest gerado contém
      o shortcut.
- [ ] Extrair `ExportDropdown` para componente compartilhado — done when: ReportsPage
      continua funcionando com o componente extraído.
- [ ] Exportar A pagar/A receber (PDF/Excel, lista filtrada com total) — done when:
      arquivos baixam com os dados visíveis.
- [ ] Exportar extrato (PDF/Excel com saldos inicial/final) — done when: idem.
Verify: smoke navegador; typecheck verde.

## Fase C: Modo escuro

Goal: tema dark completo com preferência auto/claro/escuro persistida.
Tasks:
- [ ] Variantes dark dos tokens (estrutura, texto, semânticos, sombras) via
      `prefers-color-scheme` + `data-theme` no html — done when: nenhuma cor ilegível
      nas telas principais no dark.
- [ ] Hook/util de tema com localStorage e aplicação no boot (sem flash) — done when:
      preferência sobrevive a reload.
- [ ] Seletor de tema na página Mais e no rodapé da sidebar — done when: alternar
      pelos dois lugares funciona.
- [ ] Varredura de cores fixas restantes (tooltip do recharts, chips, skeleton,
      overlays) — done when: smoke visual dark sem manchas claras.
Verify: screenshots light/dark, mobile/desktop; typecheck verde.

## Fase D: Backup + healthcheck no Mac mini

Goal: banco com backup diário em dois destinos e queda avisada no Telegram.
Tasks:
- [ ] `deploy/backup-fluxo-db.sh` + `deploy/com.fluxocaixa.backup.plist` (03:30,
      sqlite3 .backup, gzip, retenção 30d, disco + iCloud) — done when: execução
      manual cria os dois arquivos e poda antigos.
- [ ] `deploy/healthcheck-fluxo.sh` + `deploy/com.fluxocaixa.healthcheck.plist`
      (10 min, transições ok↔fora via Telegram, autocura do webhook quando a URL do
      túnel muda) — done when: execução manual com app de pé fica muda; simulação de
      queda gera 1 mensagem; URL divergente reaponta webhook.
- [ ] `deploy/README.md` com instalação/desinstalação dos agents — done when: doc
      cobre install, logs e teste manual.
- [ ] Instalar os dois agents no Mac mini via SSH e rodar teste manual — done when:
      `launchctl list` mostra ambos e testes acima passam em produção.
Verify: backups existentes nos dois destinos; mensagem de teste recebida no chat.

## Fase E: Verificação final, push e deploy

Goal: tudo verde, GitHub atualizado, produção rodando o lote.
Tasks:
- [ ] typecheck + test + build + smoke final nas duas larguras/temas — done when: verdes.
- [ ] Push e CI verde — done when: Actions passa.
- [ ] Deploy no Mac mini (backup manual antes, pull, npm ci, build, migrate no-op,
      kickstart do app; túnel intocado) — done when: URL pública serve o novo build
      e health ok.
- [ ] Resumo final pro usuário — done when: entregue com o que mudou e como usar.
