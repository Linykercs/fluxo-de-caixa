import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBudgetInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { Budget, BudgetReportRow } from "./types";

const BUDGETS_KEY = ["budgets"] as const;
const REPORT_KEY = (month: string) => ["budgets", "report", month] as const;

export function useBudgetReport(month: string) {
  return useQuery({
    queryKey: REPORT_KEY(month),
    queryFn: () => apiFetch<BudgetReportRow[]>(`/budgets/report?month=${month}`),
    placeholderData: keepPreviousData,
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: BUDGETS_KEY,
    queryFn: () => apiFetch<Budget[]>("/budgets"),
  });
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["budgets"] });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetInput) => apiFetch<Budget>("/budgets", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountCents, effectiveMonth }: { id: string; amountCents: number; effectiveMonth: string }) =>
      apiFetch<Budget>(`/budgets/${id}`, { method: "PATCH", body: JSON.stringify({ amountCents, effectiveMonth }) }),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useCancelBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, effectiveMonth }: { id: string; effectiveMonth: string }) =>
      apiFetch<{ canceled: boolean }>(`/budgets/${id}?effectiveMonth=${effectiveMonth}`, { method: "DELETE" }),
    onSuccess: () => invalidateAll(queryClient),
  });
}
