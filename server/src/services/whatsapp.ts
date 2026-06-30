// Sessão única e global do WhatsApp não-oficial (whatsapp-web.js): um número
// logado manda lembretes para o número cadastrado em cada organização.
// Diferente do Telegram, não há "vínculo" por organização: o número de
// destino é só um campo (Organization.whatsappPhoneNumber).
import { existsSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
// whatsapp-web.js é CommonJS ("export = "); import nomeado falha em runtime ESM
// (o cjs-module-lexer do Node não detecta os named exports desse pacote).
import WAWebJS from "whatsapp-web.js";
import { config } from "../lib/config.js";
import { BusinessError } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";

const { Client, LocalAuth } = WAWebJS;

export type WhatsAppStatus = "disabled" | "starting" | "qr" | "code" | "connected" | "disconnected";

let client: WAWebJS.Client | null = null;
let status: WhatsAppStatus = "disabled";
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;

// O pacote "chromium" do apt no Ubuntu do nixpacks é só um stub que exige snap
// (não disponível em container, falha com "requires the chromium snap to be
// installed"). Por isso NÃO tentamos detectar um Chromium do sistema: só
// usamos PUPPETEER_EXECUTABLE_PATH se alguém setar explicitamente; sem isso,
// deixa o puppeteer usar o Chromium que ele mesmo baixa (PUPPETEER_SKIP_DOWNLOAD
// precisa estar "false" — ver nixpacks.toml).
function resolveExecutablePath(): string | undefined {
  if (config.puppeteerExecutablePath && existsSync(config.puppeteerExecutablePath)) {
    return config.puppeteerExecutablePath;
  }
  return undefined;
}

/** Inicia a sessão (1x, no boot do servidor). Não-bloqueante: erros só ficam logados. */
export function initWhatsApp(): void {
  if (!config.whatsappEnabled) {
    console.warn("[whatsapp] WHATSAPP_ENABLED não é \"true\"; integração desativada.");
    return;
  }

  status = "starting";
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.resolve(config.whatsappSessionPath) }),
    puppeteer: { executablePath: resolveExecutablePath(), args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    // A versão do WhatsApp Web embutida no pacote fica desatualizada rápido e o
    // WhatsApp passa a recusar a vinculação de novos aparelhos com essa versão
    // ("Can't link new devices right now"). Busca a versão atual num cache mantido
    // pela comunidade em vez de usar a bundled. Se a vinculação voltar a falhar
    // com esse mesmo erro, pegue a versão mais nova em
    // https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json
    // (campo "currentVersion") e troque o número abaixo.
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1042411060-alpha.html",
    },
    // Alternativa ao QR: digitar um código de 8 caracteres no celular
    // (Aparelhos conectados → Vincular com número de telefone). É o número do
    // CELULAR QUE VAI SER O BOT — não tem relação com o de nenhuma organização.
    ...(config.whatsappPairingPhoneNumber
      ? { pairWithPhoneNumber: { phoneNumber: normalizePhoneNumber(config.whatsappPairingPhoneNumber) } }
      : {}),
  });

  client.on("qr", (qr) => {
    status = "qr";
    pairingCode = null;
    QRCode.toDataURL(qr)
      .then((dataUrl) => {
        qrDataUrl = dataUrl;
      })
      .catch((err) => console.error("[whatsapp] falha ao gerar QR code", err));
  });

  client.on("code", (code) => {
    status = "code";
    qrDataUrl = null;
    pairingCode = code;
    console.log("[whatsapp] código de pareamento gerado");
  });

  client.on("ready", () => {
    status = "connected";
    qrDataUrl = null;
    pairingCode = null;
    console.log("[whatsapp] sessão conectada");
  });

  client.on("disconnected", (reason) => {
    status = "disconnected";
    qrDataUrl = null;
    pairingCode = null;
    console.warn("[whatsapp] sessão desconectada", reason);
  });

  client.on("auth_failure", (msg) => {
    status = "disconnected";
    console.error("[whatsapp] falha de autenticação", msg);
  });

  client.initialize().catch((err) => {
    status = "disconnected";
    console.error("[whatsapp] falha ao inicializar", err);
  });
}

export function getWhatsAppStatus(): { status: WhatsAppStatus; qrDataUrl: string | null; pairingCode: string | null } {
  return {
    status,
    qrDataUrl: status === "qr" ? qrDataUrl : null,
    pairingCode: status === "code" ? pairingCode : null,
  };
}

/** "(11) 99999-8888", "+55 11 99999-8888" etc. → dígitos puros, com DDI 55 se faltar. */
export function normalizePhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) {
    throw new BusinessError("INVALID_PHONE_NUMBER", "Número de WhatsApp inválido");
  }
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<void> {
  if (!client || status !== "connected") {
    throw new BusinessError("WHATSAPP_NOT_CONNECTED", "Sessão do WhatsApp não está conectada");
  }
  await client.sendMessage(`${normalizePhoneNumber(phoneNumber)}@c.us`, text);
}

export async function getOrganizationPhoneNumber(db: Db, organizationId: string): Promise<string | null> {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return organization.whatsappPhoneNumber;
}

export async function setOrganizationPhoneNumber(
  db: Db,
  organizationId: string,
  phoneNumber: string | null,
): Promise<string | null> {
  const normalized = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
  const organization = await db.organization.update({
    where: { id: organizationId },
    data: { whatsappPhoneNumber: normalized },
  });
  return organization.whatsappPhoneNumber;
}
