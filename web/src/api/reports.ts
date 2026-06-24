import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClosePeriodInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { CategorySummaryRow, ChartMonth, CostCenterReport, CounterpartySummaryRow, DreReport, MonthFlow } from "./types";

export function useCashFlowReport(year: number) {
  return useQuery({
    queryKey: ["reports", "cash-flow", year],
    queryFn: () => apiFetch<MonthFlow[]>(`/reports/cash-flow?year=${year}`),
  });
}

export function useByCategoryReport(month: string) {
  return useQuery({
    queryKey: ["reports", "by-category", month],
    queryFn: () => apiFetch<CategorySummaryRow[]>(`/reports/by-category?month=${month}`),
  });
}

export function useByCounterpartyReport(month: string) {
  return useQuery({
    queryKey: ["reports", "by-counterparty", month],
    queryFn: () => apiFetch<CounterpartySummaryRow[]>(`/reports/by-counterparty?month=${month}`),
  });
}

export function useDreReport(month: string) {
  return useQuery({
    queryKey: ["reports", "dre", month],
    queryFn: () => apiFetch<DreReport>(`/reports/dre?month=${month}`),
  });
}

export function useCostCenterReport(month: string) {
  return useQuery({
    queryKey: ["reports", "cost-centers", month],
    queryFn: () => apiFetch<CostCenterReport[]>(`/reports/cost-centers?month=${month}`),
  });
}

export function useChartReport(months = 6) {
  return useQuery({
    queryKey: ["reports", "chart", months],
    queryFn: () => apiFetch<ChartMonth[]>(`/dashboard/chart?months=${months}`),
  });
}

export function useClosePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClosePeriodInput) =>
      apiFetch<{ closedThroughMonth: string | null }>("/reports/close-period", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", "dre"] }),
  });
}
