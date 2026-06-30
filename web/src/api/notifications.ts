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
