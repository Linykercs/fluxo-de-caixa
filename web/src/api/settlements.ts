import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SettleEntryInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { EntryDirection, Settlement } from "./types";

function useInvalidateAfterSettlement(direction: EntryDirection) {
  const queryClient = useQueryClient();
  return (entryId: string) => {
    queryClient.invalidateQueries({ queryKey: ["entry", entryId] });
    queryClient.invalidateQueries({ queryKey: ["entries", direction] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
  };
}

export function useSettleEntry(direction: EntryDirection) {
  const invalidate = useInvalidateAfterSettlement(direction);
  return useMutation({
    mutationFn: ({ entryId, input }: { entryId: string; input: SettleEntryInput }) =>
      apiFetch<Settlement>(`/entries/${entryId}/settle`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (_settlement, { entryId }) => invalidate(entryId),
  });
}

export function useReverseSettlement(direction: EntryDirection) {
  const invalidate = useInvalidateAfterSettlement(direction);
  return useMutation({
    mutationFn: ({ settlementId }: { settlementId: string; entryId: string }) =>
      apiFetch<Settlement>(`/settlements/${settlementId}/reverse`, { method: "POST" }),
    onSuccess: (_settlement, { entryId }) => invalidate(entryId),
  });
}
