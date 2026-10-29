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

type ApiState<T> = { key: string; data: T | null; error: string };

/** Charge une URL JSON. Pendant un rechargement, `loading` est vrai et les anciennes données restent affichées. */
export function useApi<T>(url: string) {
  const [tick, setTick] = useState(0);
  const key = `${url}|${tick}`;
  const [state, setState] = useState<ApiState<T>>({ key: "", data: null, error: "" });

  useEffect(() => {
    let alive = true;
    api<T>(url)
      .then((data) => { if (alive) setState({ key, data, error: "" }); })
      .catch((e: unknown) => {
        if (alive) setState((previous) => ({ key, data: previous.data, error: e instanceof Error ? e.message : "Connexion impossible." }));
      });
    return () => { alive = false; };
  }, [url, key]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data: state.data, error: state.error, loading: state.key !== key, reload };
}
