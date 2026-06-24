import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCategoryInput, UpdateCategoryInput } from "@fluxo/shared";
import { apiFetch } from "./client";
import type { Category, CategoryKind } from "./types";

export function useCategories(kind?: CategoryKind) {
  return useQuery({
    queryKey: ["categories", kind ?? "all"],
    queryFn: () => apiFetch<Category[]>(`/categories${kind ? `?kind=${kind}` : ""}`),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiFetch<Category>("/categories", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UpdateCategoryInput }) =>
      apiFetch<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}
