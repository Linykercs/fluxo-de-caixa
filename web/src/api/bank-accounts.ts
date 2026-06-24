import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBankAccountInput, UpdateBankAccountInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { BankAccountSummary, Statement } from "./types";

export function useBankAccounts() {
  return useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccountSummary[]>("/bank-accounts"),
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBankAccountInput) =>
      apiFetch<BankAccountSummary>("/bank-accounts", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateBankAccountInput }) =>
      apiFetch<BankAccountSummary>(`/bank-accounts/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });
}

interface StatementFilters {
  from?: string;
  to?: string;
}

function buildStatementQuery(filters: StatementFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useStatement(accountId: string, filters: StatementFilters) {
  return useQuery({
    queryKey: ["statement", accountId, filters],
    queryFn: () => apiFetch<Statement>(`/bank-accounts/${accountId}/statement${buildStatementQuery(filters)}`),
    enabled: Boolean(accountId),
  });
}
