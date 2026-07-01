import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { Dashboard } from "./types";

export function useDashboard(month: string) {
  return useQuery({
    queryKey: ["dashboard", month],
    queryFn: () => apiFetch<Dashboard>(`/dashboard?month=${month}`),
    // mantém os dados do mês anterior visíveis (com leve fade) enquanto busca
    // o novo, em vez de piscar "Carregando..." toda vez que troca de mês
    placeholderData: keepPreviousData,
  });
}
