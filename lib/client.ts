"use client";

import { useCallback, useEffect, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...((init?.headers as Record<string, string> | undefined) ?? {}) }
  });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expirée. Reconnexion…");
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: string }).error;
    throw new Error(message ?? "Une erreur est survenue.");
  }
  return data as T;
}

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
