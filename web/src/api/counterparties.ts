import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCounterpartyInput, UpdateCounterpartyInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { Counterparty } from "./types";

const KEY = ["counterparties"] as const;

export function useCounterparties() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<Counterparty[]>("/counterparties"),
  });
}

export function useCreateCounterparty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCounterpartyInput) =>
      apiFetch<Counterparty>("/counterparties", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCounterparty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateCounterpartyInput }) =>
      apiFetch<Counterparty>(`/counterparties/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export interface CounterpartyTelegramStatus {
  linked: boolean;
  linkToken: string | null;
  botUsername: string | null;
}

export function useCounterpartyTelegramStatus(counterpartyId: string | null) {
  return useQuery({
    queryKey: ["counterparties", counterpartyId, "telegram"],
    queryFn: () => apiFetch<CounterpartyTelegramStatus>(`/counterparties/${counterpartyId}/telegram`),
    enabled: counterpartyId !== null,
    refetchInterval: (query) => (query.state.data?.linked ? false : 3000),
  });
}

export function useRegenerateCounterpartyTelegramToken(counterpartyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ linkToken: string }>(`/counterparties/${counterpartyId}/telegram/regenerate-token`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["counterparties", counterpartyId, "telegram"] }),
  });
}

export function useUnlinkCounterpartyTelegram(counterpartyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ linked: boolean }>(`/counterparties/${counterpartyId}/telegram/unlink`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["counterparties", counterpartyId, "telegram"] }),
  });
}

export function useTestCounterpartyTelegram(counterpartyId: string) {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(`/counterparties/${counterpartyId}/telegram/test`, { method: "POST" }),
  });
}

export function useTestCounterpartyWhatsApp(counterpartyId: string) {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(`/counterparties/${counterpartyId}/whatsapp/test`, { method: "POST" }),
  });
}
