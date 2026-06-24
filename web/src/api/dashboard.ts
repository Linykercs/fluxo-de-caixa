import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { Dashboard } from "./types";

export function useDashboard(month: string) {
  return useQuery({
    queryKey: ["dashboard", month],
    queryFn: () => apiFetch<Dashboard>(`/dashboard?month=${month}`),
  });
}
