# Plan: WhatsApp via API oficial (multi-tenant, pronto pra vender)

Sem spec formal antecedendo este plano — decisão de arquitetura discutida direto com o
usuário em sessão, motivada pela intenção de vender o produto pra outros clientes e pela
instabilidade do WhatsApp não-oficial (Baileys) descoberta em produção em 2026-07-20
(ver `docs/deploy-mac-mini.md` e histórico de commits do dia).

Regras: cada fase termina verde e vira commit próprio; decisões de negócio (provedor,
preço, CNPJ) ficam marcadas como bloqueio explícito — não avançar a fase sem responder.

## Por que migrar (contexto pra quem ler isso depois)

O app hoje manda lembretes de WhatsApp com **Baileys**, uma biblioteca não-oficial que
fala o protocolo do WhatsApp Web direto (sem ser a Meta quem autoriza). Isso funciona
pra uso pessoal, mas tem três problemas que inviabilizam vender o produto assim:

1. **Viola os Termos de Serviço do WhatsApp** — risco de banimento do número usado.
2. **Um bot só pra todo mundo** — hoje é um único número (o do dono do app) mandando
   mensagem pra todos os clientes; se banir, todo mundo perde a funcionalidade junto.
3. **Não escala e não tem suporte** — cada cliente precisaria de um número de celular
   de verdade pareado manualmente, e quando o WhatsApp muda algo internamente (como
   aconteceu em 2026-07-20, ver commits `fix(whatsapp): ...`), não tem fornecedor pra
   acionar — só esperar a comunidade consertar a lib.

A alternativa correta é a **WhatsApp Business Platform** (API oficial da Meta): cada
cliente conecta o **próprio número comercial verificado**, sem depender de um número seu
e sem risco de banimento em cascata.

## Decisão bloqueante: escolher o provedor

Duas rotas, preciso que o usuário escolha antes da Fase A:

| | Meta Cloud API direto | BSP (ex: 360dialog, Twilio, Take Blip, Gupshup) |
|---|---|---|
| Custo de entrada | Grátis pra criar conta/app | Geralmente tem taxa de setup/mensalidade do BSP, além do custo por conversa da Meta |
| Complexidade de integração | Você lida com toda a burocracia da Meta (Business Manager, verificação, webhooks) direto | BSP abstrai boa parte disso, painel mais amigável, suporte em português (Take Blip é brasileiro) |
| Onboarding de cada cliente novo | Você implementa o fluxo de "Embedded Signup" da Meta | Geralmente o BSP já tem esse fluxo pronto/mais simples de embutir |
| Melhor pra | Quem já tem/vai ter time técnico dedicado a isso | Operação pequena/solo querendo focar no produto, não na integração com a Meta |

**Recomendação**: dado que essa é uma operação pequena (um app self-hosted, mantido por
uma pessoa), começar com um **BSP** (sugestão: 360dialog ou Take Blip) reduz muito a
carga operacional — vale essa conversa antes de abrir a Fase A.

Também bloqueante: a verificação de negócio da Meta exige **CNPJ** (não dá pra fazer com
CPF/pessoa física) tanto pra você quanto, mais pra frente, potencialmente pra cada
cliente que quiser seu próprio número verificado (depende de como o onboarding for
desenhado — ver Fase D).

## Visão geral da nova arquitetura

```
Organization (por cliente)
  └── whatsappBusinessPhoneNumberId  (ID do número dele na Meta)
  └── whatsappBusinessAccessToken     (token de acesso, criptografado no banco)
  └── whatsappTemplateNamespace       (se aplicável ao provedor)

Envio de lembrete:
  server → POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
           (ou endpoint equivalente do BSP escolhido)
           usando um TEMPLATE aprovado (não texto livre)

Recebimento (status de entrega, opt-out, respostas):
  Meta/BSP → webhook HTTPS do nosso servidor (novo endpoint público)
```

Muda de "uma sessão de bot global" pra "cada organização com sua própria credencial",
parecido com o padrão que já existe pro Telegram (`telegramChatId` por organização) —
só que agora com token de API em vez de chat ID.

## Fase A: Provedor e conta

Goal: conta de desenvolvedor pronta, número de teste funcionando end-to-end.
Bloqueio: decisão de provedor (tabela acima) + CNPJ disponível pra verificação.
Tasks:
- [ ] Criar Meta Business Manager (ou conta no BSP escolhido) — done when: acesso
      liberado ao painel.
- [ ] Criar um WhatsApp Business Account (WABA) de teste com número de teste grátis
      da Meta (não precisa de número real pra desenvolver) — done when: consegue
      mandar mensagem de teste pelo painel/Postman.
- [ ] Gerar um access token de longa duração (System User token, não o temporário de
      24h) — done when: token funciona em uma chamada de API fora do painel.
- [ ] Documentar em `docs/credentials.local.md` as credenciais de desenvolvimento
      (não commitar) — done when: entrada criada.
Verify: uma chamada `curl` manual manda mensagem de template pro seu próprio WhatsApp
usando o número de teste.

## Fase B: Modelagem de dados multi-tenant

Goal: schema pronto pra guardar credencial de WhatsApp por organização.
Tasks:
- [ ] Migration: novos campos em `Organization` — `whatsappBusinessPhoneNumberId`,
      `whatsappBusinessAccessToken` (considerar criptografar em repouso, já que é
      credencial sensível — ver nota abaixo), `whatsappTemplateStatus` — done when:
      migration aplica limpo em dev.
  - Nota: `whatsappPhoneNumber` (destino, por usuário) continua existindo — é uma
    coisa diferente (pra quem a mensagem vai, não a credencial de quem envia).
- [ ] Remover/deprecar `WHATSAPP_ENABLED`, `WHATSAPP_SESSION_PATH`,
      `WHATSAPP_PAIRING_PHONE_NUMBER` do `config.ts` (eram só pro Baileys) — done when:
      nenhuma referência sobra no código.
Verify: `npm run typecheck` e `npm test` verdes.

## Fase C: Serviço de envio via API oficial

Goal: `sendWhatsAppMessage` fala com a Graph API (ou BSP) em vez do Baileys.
Tasks:
- [ ] Remover `baileys` do `package.json` e apagar `server/src/services/whatsapp.ts`
      (a versão atual, baseada em socket) — done when: build sem a dependência.
- [ ] Criar `server/src/services/whatsapp-business.ts`: função `sendWhatsAppMessage`
      que recebe `organizationId`, resolve `phoneNumberId`/`accessToken` da org, e
      faz `POST /{phone_number_id}/messages` com o template aprovado — done when:
      função testada manualmente contra o número de teste da Fase A.
- [ ] Tratamento de erro específico da Graph API (token expirado, número não
      verificado, template rejeitado, limite de conversas do tier atingido) mapeado
      pra `BusinessError`s claros — done when: cada erro comum tem uma mensagem
      acionável (não só "erro genérico").
- [ ] Atualizar `reminders.ts` pra chamar o novo serviço (a lógica de "quem recebe o
      quê" não muda, só troca o transporte) — done when: teste de reminders passa.
Verify: `npm test` verde; envio manual de lembrete de teste chega no WhatsApp.

## Fase D: Templates de mensagem

Goal: os textos de lembrete aprovados pela Meta, prontos pra usar em produção.
Bloqueio: aprovação de template pela Meta pode levar de minutas a alguns dias.
Tasks:
- [ ] Desenhar os templates (categoria **Utility**, que é a certa pra lembrete
      transacional — mais barata que Marketing) — done when: texto com variáveis
      (`{{1}}` = descrição, `{{2}}` = valor, etc.) definido pros dois casos que já
      existem: "vencendo hoje" e "vencendo amanhã".
- [ ] Submeter os templates pelo painel da Meta/BSP — done when: status "Approved".
- [ ] Ajustar `buildMessage` em `reminders.ts` pra montar as variáveis do template
      em vez de texto livre — done when: mensagem final bate com o preview aprovado.
Verify: mensagem de teste usando o template aprovado chega formatada corretamente.

## Fase E: Onboarding de cliente (conectar o próprio número)

Goal: um cliente novo consegue ligar o WhatsApp dele sem você mexer no código.
Tasks:
- [ ] Decidir o fluxo: **Embedded Signup** da Meta (cliente autoriza dentro do seu
      app, você recebe o `phone_number_id` automaticamente) vs onboarding manual
      (cliente te manda os dados, você cadastra por trás) — done when: decisão
      registrada aqui.
- [ ] Se Embedded Signup: integrar o SDK JS da Meta na tela de Notificações — done
      when: um usuário ADMIN consegue conectar o WhatsApp da empresa dele sozinho.
- [ ] Se manual: formulário/rota admin pra você preencher `phoneNumberId` +
      `accessToken` de um cliente — done when: testado com uma org fictícia.
- [ ] Atualizar `NotificationsPage.tsx` pra refletir o novo fluxo (troca a tela de
      QR/código de pareamento inteira) — done when: fluxo completo testável na UI.
Verify: uma organização de teste consegue ficar "conectada" do zero pela UI.

## Fase F: Webhook de status e conformidade

Goal: receber confirmações de entrega e respeitar opt-out.
Tasks:
- [ ] Rota `POST /webhooks/whatsapp-business` (verificação de assinatura da Meta) —
      done when: Meta consegue validar o endpoint no painel.
- [ ] Tratar eventos de status (`sent`/`delivered`/`read`/`failed`) — pelo menos logar;
      opcionalmente guardar no banco pra diagnóstico — done when: eventos de teste
      aparecem no log.
- [ ] Tratar opt-out (usuário bloqueou o número ou pediu pra parar) — desativar o
      `whatsappPhoneNumber` daquele usuário automaticamente — done when: teste
      simulado desativa o campo.
Verify: webhook de teste da Meta chega e é processado sem erro 4xx/5xx.

## Fase G: Cutover e descontinuação do Baileys

Goal: produção rodando só na API oficial, nada do código antigo sobrando.
Tasks:
- [ ] Migrar a organização real (Triari) pra um número verificado de verdade (aqui
      sim precisa decidir: número novo dedicado, ou portar um WhatsApp existente
      pra Business — a Meta tem um fluxo de migração de conta pessoal→business) —
      done when: mensagem real de produção passa pelo caminho novo.
- [ ] Atualizar `docs/deploy-mac-mini.md` (remove seção de Baileys/sessão local,
      adiciona variáveis novas) — done when: doc reflete a arquitetura nova.
- [ ] Atualizar `docs/credentials.local.md` — done when: token/credenciais reais
      documentados (com nota de rotação periódica).
Verify: `npm run typecheck` + `npm test` + build verdes; deploy no Mac mini; lembrete
real de produção chega via API oficial.

## Fase H: Precificação (decisão de negócio, não técnica)

Goal: saber quanto cobrar dos clientes cobrindo o custo por mensagem.
Tasks:
- [ ] Levantar o custo por conversa **Utility** na categoria/país dos seus clientes
      (a Meta cobra por conversa de 24h, não por mensagem individual — várias
      mensagens na mesma janela de 24h custam uma vez só) — done when: número em
      R$/conversa anotado.
- [ ] Considerar a cota gratuita mensal de conversas de serviço que a Meta costuma
      dar (varia; confirmar valor atual no painel) — done when: confirmado.
- [ ] Definir se o custo de WhatsApp é embutido na mensalidade do cliente ou
      cobrado à parte — done when: decisão registrada (fora do escopo técnico deste
      plano, mas trava o rollout comercial).

## Estimativa de esforço

- Fases A–C (fundação técnica): a parte mais previsível, dá pra fazer sem depender
  de terceiros além da conta da Meta/BSP.
- Fase D (templates): depende de aprovação externa da Meta — não é esforço seu, mas
  é **tempo de espera** que não dá pra apressar.
- Fase E (onboarding): a mais trabalhosa se for Embedded Signup; bem mais rápida se
  for onboarding manual (aceitável enquanto forem poucos clientes).
- Fases F–G: incrementais, dá pra fazer em paralelo com os primeiros clientes reais.

## Riscos abertos

- Verificação de negócio da Meta pode pedir documentos e levar alguns dias — não
  é algo que dá pra prever com precisão de antemão.
- Se o plano for revender pra clientes que já têm WhatsApp pessoal ativo no número
  que querem usar, a migração pra Business tem passos específicos (não é só criar
  do zero) — vale mapear caso a caso quando o primeiro cliente real aparecer.
- Preço por conversa muda por país/categoria e a Meta já reajustou isso no passado —
  vale revisitar antes de fechar a precificação final com os clientes.
