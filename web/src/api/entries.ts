import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateEntryInput, RecurrenceScopeInput, UpdateEntryInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { Entry, EntryDetail, EntryDirection, EntryStatus, Recurrence } from "./types";

export interface EntryFilters {
  month?: string;
  status?: EntryStatus;
  categoryId?: string;
  costCenterId?: string;
  bankAccountId?: string;
}

const PATHS: Record<EntryDirection, string> = {
  PAYABLE: "/payables",
  RECEIVABLE: "/receivables",
};

function buildQuery(filters: EntryFilters): string {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  if (filters.status) params.set("status", filters.status);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.costCenterId) params.set("costCenterId", filters.costCenterId);
  if (filters.bankAccountId) params.set("bankAccountId", filters.bankAccountId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useEntries(direction: EntryDirection, filters: EntryFilters) {
  return useQuery({
    queryKey: ["entries", direction, filters],
    queryFn: () => apiFetch<Entry[]>(`${PATHS[direction]}${buildQuery(filters)}`),
  });
}

export function useEntry(id: string) {
  return useQuery({
    queryKey: ["entry", id],
    queryFn: () => apiFetch<EntryDetail>(`/entries/${id}`),
  });
}

function useInvalidateEntries(direction: EntryDirection) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["entries", direction] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
  };
}

type CreateEntryResult = { entry: Entry } | { entries: Entry[] } | { recurrence: Recurrence };

export function useCreateEntry(direction: EntryDirection) {
  const invalidate = useInvalidateEntries(direction);
  return useMutation({
    mutationFn: (input: CreateEntryInput) =>
      apiFetch<CreateEntryResult>(PATHS[direction], { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateEntry(direction: EntryDirection) {
  const invalidate = useInvalidateEntries(direction);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateEntryInput }) =>
      apiFetch<EntryDetail>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: (entry) => {
      queryClient.setQueryData(["entry", entry.id], entry);
      invalidate();
    },
  });
}

export function useDeleteEntry(direction: EntryDirection) {
  const invalidate = useInvalidateEntries(direction);
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/entries/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRecurrenceScope(direction: EntryDirection) {
  const invalidate = useInvalidateEntries(direction);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecurrenceScopeInput }) =>
      apiFetch<EntryDetail>(`/entries/${id}/recurrence-scope`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: (entry) => {
      queryClient.setQueryData(["entry", entry.id], entry);
      invalidate();
    },
  });
}
