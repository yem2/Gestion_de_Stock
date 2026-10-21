"use client";

import { useCallback, useEffect, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined
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

type ApiState<T> = { url: string; data: T | null; error: string };

/** Charge une URL JSON. `reload()` relit sans clignotement ; `loading` est vrai tant que l'URL demandée n'est pas chargée. */
export function useApi<T>(url: string) {
  const [state, setState] = useState<ApiState<T>>({ url: "", data: null, error: "" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api<T>(url)
      .then((data) => { if (alive) setState({ url, data, error: "" }); })
      .catch((e: unknown) => { if (alive) setState({ url, data: null, error: e instanceof Error ? e.message : "Connexion impossible." }); });
    return () => { alive = false; };
  }, [url, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data: state.data, error: state.error, loading: state.url !== url, reload };
}
