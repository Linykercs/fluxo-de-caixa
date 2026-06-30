import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

const TELEGRAM_KEY = ["notifications", "telegram"] as const;

export interface TelegramStatus {
  linked: boolean;
  linkToken: string | null;
  botUsername: string | null;
}

export function useTelegramStatus() {
  return useQuery({
    queryKey: TELEGRAM_KEY,
    queryFn: () => apiFetch<TelegramStatus>("/notifications/telegram"),
  });
}

export function useRegenerateTelegramToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ linkToken: string }>("/notifications/telegram/regenerate-token", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TELEGRAM_KEY }),
  });
}

export function useUnlinkTelegram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ linked: boolean }>("/notifications/telegram/unlink", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TELEGRAM_KEY }),
  });
}

export function useTestTelegram() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/notifications/telegram/test", { method: "POST" }),
  });
}

const WHATSAPP_KEY = ["notifications", "whatsapp"] as const;

export type WhatsAppSessionStatus = "disabled" | "starting" | "qr" | "connected" | "disconnected";

export interface WhatsAppStatus {
  phoneNumber: string | null;
  status: WhatsAppSessionStatus;
  qrDataUrl: string | null;
}

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: WHATSAPP_KEY,
    queryFn: () => apiFetch<WhatsAppStatus>("/notifications/whatsapp"),
    // a sessão muda de estado de forma assíncrona (escaneou o QR, conectou etc.)
    refetchInterval: (query) => (query.state.data?.status === "connected" ? false : 3000),
  });
}

export function useSetWhatsAppNumber() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phoneNumber: string | null) =>
      apiFetch<{ phoneNumber: string | null }>("/notifications/whatsapp/number", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WHATSAPP_KEY }),
  });
}

export function useTestWhatsApp() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/notifications/whatsapp/test", { method: "POST" }),
  });
}
