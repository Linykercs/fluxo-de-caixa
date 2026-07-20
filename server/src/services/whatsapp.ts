// Sessão única e global do WhatsApp não-oficial (Baileys): um número logado
// manda lembretes para o número cadastrado em cada usuário. Diferente do
// Telegram, não há "vínculo" por organização: o destino é por usuário
// (User.whatsappPhoneNumber).
//
// Trocado de whatsapp-web.js (automação de navegador) pra Baileys (fala o
// protocolo WhatsApp direto via WebSocket) porque o whatsapp-web.js parou de
// completar login/envio ("No LID for user") depois de uma mudança do WhatsApp
// no sistema de identidade "LID" — bug conhecido e sem correção disponível na
// versão mais recente da lib. Baileys resolve LID nativamente (via onWhatsApp).
import path from "node:path";
import { Boom } from "@hapi/boom";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WASocket } from "baileys";
import pino from "pino";
import QRCode from "qrcode";
import { config } from "../lib/config.js";
import { BusinessError } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";

export type WhatsAppStatus = "disabled" | "starting" | "qr" | "code" | "connected" | "disconnected";

let sock: WASocket | null = null;
let status: WhatsAppStatus = "disabled";
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;

const logger = pino({ level: "warn" });

/** Inicia a sessão (1x, no boot do servidor). Não-bloqueante: erros só ficam logados. */
export function initWhatsApp(): void {
  if (!config.whatsappEnabled) {
    console.warn('[whatsapp] WHATSAPP_ENABLED não é "true"; integração desativada.');
    return;
  }
  status = "starting";
  void startSocket();
}

async function startSocket(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(path.resolve(config.whatsappSessionPath));
  // A versão de protocolo embutida no Baileys "legacy" (6.7.23) já ficou velha
  // o suficiente pro WhatsApp rejeitar a conexão de cara (desconecta com 405);
  // buscar a versão atual evita isso.
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const socket = makeWASocket({ auth: state, version, logger, browser: ["FluxoCaixa", "Chrome", "1.0"] });
  sock = socket;
  socket.ev.on("creds.update", saveCreds);
  // Pedir o código cedo demais (antes do WebSocket estabilizar) falha com
  // "Connection Closed"; a chegada do primeiro QR é o sinal de que o socket
  // está pronto pra aceitar requestPairingCode. Uma vez por socket.
  let pairingRequested = false;

  socket.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !state.creds.registered && config.whatsappPairingPhoneNumber && !pairingRequested) {
      // Pareamento por código (digitado no celular) em vez de QR. É o número do
      // CELULAR QUE VAI SER O BOT — não tem relação com nenhuma organização cliente.
      pairingRequested = true;
      socket
        .requestPairingCode(normalizePhoneNumber(config.whatsappPairingPhoneNumber))
        .then((code) => {
          status = "code";
          qrDataUrl = null;
          pairingCode = code;
          console.log(`[whatsapp] código de pareamento gerado: ${code}`);
        })
        .catch((err) => console.error("[whatsapp] falha ao solicitar código de pareamento", err));
    } else if (qr && !config.whatsappPairingPhoneNumber) {
      status = "qr";
      pairingCode = null;
      QRCode.toDataURL(qr)
        .then((dataUrl) => {
          qrDataUrl = dataUrl;
        })
        .catch((err) => console.error("[whatsapp] falha ao gerar QR code", err));
    }

    if (connection === "open") {
      status = "connected";
      qrDataUrl = null;
      pairingCode = null;
      console.log("[whatsapp] sessão conectada");
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      // 401 (loggedOut) só é definitivo com sessão registrada (usuário desvinculou
      // no celular); durante um pareamento incompleto ele é esperado e deve reiniciar
      // o ciclo pra gerar QR/código novos.
      const finalLogout = statusCode === DisconnectReason.loggedOut && state.creds.registered;
      status = "disconnected";
      qrDataUrl = null;
      pairingCode = null;
      console.warn("[whatsapp] sessão desconectada", statusCode ?? lastDisconnect?.error);
      if (!finalLogout) {
        setTimeout(() => void startSocket(), 3000);
      }
    }
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
  if (!sock || status !== "connected") {
    throw new BusinessError("WHATSAPP_NOT_CONNECTED", "Sessão do WhatsApp não está conectada");
  }
  const normalized = normalizePhoneNumber(phoneNumber);
  const [result] = (await sock.onWhatsApp(normalized)) ?? [];
  if (!result?.exists) {
    throw new BusinessError("WHATSAPP_NUMBER_NOT_REGISTERED", "Esse número não está registrado no WhatsApp");
  }
  await sock.sendMessage(result.jid, { text });
}

export async function getUserPhoneNumber(db: Db, userId: string): Promise<string | null> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return user.whatsappPhoneNumber;
}

export async function setUserPhoneNumber(db: Db, userId: string, phoneNumber: string | null): Promise<string | null> {
  const normalized = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
  const user = await db.user.update({
    where: { id: userId },
    data: { whatsappPhoneNumber: normalized },
  });
  return user.whatsappPhoneNumber;
}
