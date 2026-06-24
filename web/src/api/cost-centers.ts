import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCostCenterInput, UpdateCostCenterInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { CostCenter } from "./types";

export function useCostCenters() {
  return useQuery({
    queryKey: ["cost-centers"],
    queryFn: () => apiFetch<CostCenter[]>("/cost-centers"),
  });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCostCenterInput) =>
      apiFetch<CostCenter>("/cost-centers", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cost-centers"] }),
  });
}

export function useUpdateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateCostCenterInput }) =>
      apiFetch<CostCenter>(`/cost-centers/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cost-centers"] }),
  });
}
