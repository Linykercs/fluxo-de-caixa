// Sessão única e global do WhatsApp não-oficial (whatsapp-web.js): um número
// logado manda lembretes para o número cadastrado em cada organização.
// Diferente do Telegram, não há "vínculo" por organização: o número de
// destino é só um campo (Organization.whatsappPhoneNumber).
import { execFileSync } from "node:child_process";
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

export type WhatsAppStatus = "disabled" | "starting" | "qr" | "connected" | "disconnected";

let client: WAWebJS.Client | null = null;
let status: WhatsAppStatus = "disabled";
let qrDataUrl: string | null = null;

// O pacote "chromium" do apt no Ubuntu do nixpacks é só um stub que exige snap
// (não disponível em container); por isso instalamos via Nix (nixpacks.toml),
// cujo caminho do binário tem um hash imprevisível — resolvido aqui via `which`.
// Propositalmente NÃO inclui /usr/bin/chromium-browser nos candidatos fixos:
// é o stub do apt e parece existir no disco, mas falha ao rodar.
function resolveExecutablePath(): string | undefined {
  if (config.puppeteerExecutablePath && existsSync(config.puppeteerExecutablePath)) {
    return config.puppeteerExecutablePath;
  }
  try {
    const resolved = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
    if (resolved) return resolved;
  } catch {
    // "which" não achou nada no PATH; tenta os caminhos fixos abaixo.
  }
  const candidates = ["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
  return candidates.find((candidate) => existsSync(candidate));
}

/** Inicia a sessão (1x, no boot do servidor). Não-bloqueante: erros só ficam logados. */
export function initWhatsApp(): void {
  if (!config.whatsappEnabled) {
    console.warn("[whatsapp] WHATSAPP_ENABLED não é \"true\"; integração desativada.");
    return;
  }
  const executablePath = resolveExecutablePath();
  if (!executablePath) {
    console.error("[whatsapp] Chromium não encontrado (PUPPETEER_EXECUTABLE_PATH). Integração desativada.");
    return;
  }

  status = "starting";
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.resolve(config.whatsappSessionPath) }),
    puppeteer: { executablePath, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });

  client.on("qr", (qr) => {
    status = "qr";
    QRCode.toDataURL(qr)
      .then((dataUrl) => {
        qrDataUrl = dataUrl;
      })
      .catch((err) => console.error("[whatsapp] falha ao gerar QR code", err));
  });

  client.on("ready", () => {
    status = "connected";
    qrDataUrl = null;
    console.log("[whatsapp] sessão conectada");
  });

  client.on("disconnected", (reason) => {
    status = "disconnected";
    qrDataUrl = null;
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

export function getWhatsAppStatus(): { status: WhatsAppStatus; qrDataUrl: string | null } {
  return { status, qrDataUrl: status === "qr" ? qrDataUrl : null };
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
