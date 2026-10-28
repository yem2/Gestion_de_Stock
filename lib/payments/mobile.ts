import { randomBytes, randomUUID } from "node:crypto";

/**
 * Connexions aux opérateurs de paiement mobile : MTN Mobile Money (Collection API) et Orange Money (Web Payment).
 * Les clés viennent uniquement des variables d'environnement du serveur (jamais du navigateur ni du dépôt).
 * Aucune réponse d'opérateur n'est crue sur parole : le statut final est toujours relu auprès de l'opérateur.
 */

export type MobileProvider = "orange_money" | "mtn_money";
export type RemoteStatus = "success" | "pending" | "failed" | "expired";

export class ProviderError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

type Json = Record<string, unknown> | null;
const TIMEOUT_MS = 15_000;

function env(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined);
const basic = (user: string, secret: string) => `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;

/** Adresse publique de l'application (pour les liens de retour et les notifications des opérateurs). */
export function appUrl() {
  const explicit = env("APP_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env("VERCEL_PROJECT_PRODUCTION_URL");
  return vercel ? `https://${vercel}` : undefined;
}

export function providerStatus() {
  const mtnMissing = ["MTN_MOMO_SUBSCRIPTION_KEY", "MTN_MOMO_API_USER", "MTN_MOMO_API_KEY"].filter((name) => !env(name));
  const orangeMissing = ["ORANGE_MONEY_CLIENT_ID", "ORANGE_MONEY_CLIENT_SECRET", "ORANGE_MONEY_MERCHANT_KEY"].filter((name) => !env(name));
  if (!appUrl()) orangeMissing.push("APP_URL");
  return {
    mtn_money: { configured: mtnMissing.length === 0, environment: mtnEnv(), missing: mtnMissing },
    orange_money: { configured: orangeMissing.length === 0, environment: orangeEnv(), missing: orangeMissing }
  } satisfies Record<MobileProvider, { configured: boolean; environment: string; missing: string[] }>;
}

export function isConfigured(provider: MobileProvider) {
  return providerStatus()[provider].configured;
}

async function http(url: string, init: RequestInit, label: string): Promise<{ status: number; json: Json }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw new ProviderError(`${label} ne répond pas. Réessayez dans un instant.`, true);
  }
  const body = await res.text();
  let json: Json = null;
  try {
    json = body ? (JSON.parse(body) as Json) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** Numéro camerounais au format international sans « + » (237 + 9 chiffres). */
export function normalizeCameroonPhone(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("6")) digits = `237${digits}`;
  if (!/^237[62]\d{8}$/.test(digits)) throw new ProviderError("Numéro de téléphone invalide. Exemple : 6XX XX XX XX.");
  return digits;
}

export function newExternalId(provider: MobileProvider) {
  return provider === "mtn_money" ? randomUUID() : `GS${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

/* ---------------------------------- MTN MoMo ---------------------------------- */

function mtnEnv() {
  return env("MTN_MOMO_ENV") === "production" ? "production" : "sandbox";
}
const mtnBase = () => env("MTN_MOMO_BASE_URL") ?? (mtnEnv() === "production" ? "https://proxy.momoapi.mtn.com" : "https://sandbox.momodeveloper.mtn.com");
const mtnSubscriptionKey = () => env("MTN_MOMO_SUBSCRIPTION_KEY") ?? "";

let mtnTokenCache: { token: string; expiresAt: number } | null = null;

async function mtnToken() {
  if (mtnTokenCache && mtnTokenCache.expiresAt > Date.now() + 30_000) return mtnTokenCache.token;
  const { status, json } = await http(
    `${mtnBase()}/collection/token/`,
    { method: "POST", headers: { Authorization: basic(env("MTN_MOMO_API_USER") ?? "", env("MTN_MOMO_API_KEY") ?? ""), "Ocp-Apim-Subscription-Key": mtnSubscriptionKey() } },
    "MTN MoMo"
  );
  const token = text(json?.access_token);
  if (status !== 200 || !token) throw new ProviderError("MTN MoMo a refusé la connexion : vérifiez les clés configurées.");
  mtnTokenCache = { token, expiresAt: Date.now() + (Number(json?.expires_in) || 3600) * 1000 };
  return token;
}

/** Envoie la demande de paiement sur le téléphone du client (réponse 202 : le client doit encore confirmer). */
export async function mtnRequestToPay(input: { referenceId: string; amount: number; phone: string; message: string }) {
  const token = await mtnToken();
  const currency = env("MTN_MOMO_CURRENCY") ?? (mtnEnv() === "production" ? "XAF" : "EUR");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Reference-Id": input.referenceId,
    "X-Target-Environment": env("MTN_MOMO_TARGET_ENV") ?? (mtnEnv() === "production" ? "mtncameroon" : "sandbox"),
    "Ocp-Apim-Subscription-Key": mtnSubscriptionKey(),
    "Content-Type": "application/json"
  };
  const callback = env("MTN_MOMO_CALLBACK_URL");
  if (callback) headers["X-Callback-Url"] = callback;
  const { status } = await http(
    `${mtnBase()}/collection/v1_0/requesttopay`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: String(Math.round(input.amount)),
        currency,
        externalId: input.referenceId,
        payer: { partyIdType: "MSISDN", partyId: input.phone },
        payerMessage: input.message,
        payeeNote: input.message
      })
    },
    "MTN MoMo"
  );
  if (status === 401) mtnTokenCache = null;
  if (status !== 202) throw new ProviderError(`MTN MoMo a refusé la demande (code ${status}).`, status >= 500);
}

export async function mtnCheck(referenceId: string): Promise<{ status: RemoteStatus; reference?: string; reason?: string }> {
  const token = await mtnToken();
  const { status, json } = await http(
    `${mtnBase()}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": env("MTN_MOMO_TARGET_ENV") ?? (mtnEnv() === "production" ? "mtncameroon" : "sandbox"),
        "Ocp-Apim-Subscription-Key": mtnSubscriptionKey()
      }
    },
    "MTN MoMo"
  );
  if (status === 401) mtnTokenCache = null;
  if (status === 404) return { status: "pending" };
  if (status !== 200) throw new ProviderError(`MTN MoMo : vérification impossible (code ${status}).`, true);
  const remote = text(json?.status)?.toUpperCase();
  const reference = text(json?.financialTransactionId);
  if (remote === "SUCCESSFUL") return { status: "success", reference };
  if (remote === "FAILED") return { status: "failed", reason: text(json?.reason) };
  return { status: "pending" };
}

/* -------------------------------- Orange Money -------------------------------- */

function orangeEnv() {
  return env("ORANGE_MONEY_ENV") === "production" ? "production" : "sandbox";
}
const orangeBase = () => `https://api.orange.com/orange-money-webpay/${orangeEnv() === "production" ? (env("ORANGE_MONEY_COUNTRY") ?? "cm") : "dev"}/v1`;

let orangeTokenCache: { token: string; expiresAt: number } | null = null;

async function orangeToken() {
  if (orangeTokenCache && orangeTokenCache.expiresAt > Date.now() + 30_000) return orangeTokenCache.token;
  const { status, json } = await http(
    "https://api.orange.com/oauth/v3/token",
    {
      method: "POST",
      headers: { Authorization: basic(env("ORANGE_MONEY_CLIENT_ID") ?? "", env("ORANGE_MONEY_CLIENT_SECRET") ?? ""), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "grant_type=client_credentials"
    },
    "Orange Money"
  );
  const token = text(json?.access_token);
  if (status !== 200 || !token) throw new ProviderError("Orange Money a refusé la connexion : vérifiez les clés configurées.");
  orangeTokenCache = { token, expiresAt: Date.now() + (Number(json?.expires_in) || 3600) * 1000 };
  return token;
}

/** Crée la page de paiement Orange Money : le client y règle avec son compte. */
export async function orangeInit(input: { orderId: string; amount: number; reference: string }) {
  const base = appUrl();
  if (!base) throw new ProviderError("Adresse publique de l’application manquante (APP_URL).");
  const token = await orangeToken();
  const { status, json } = await http(
    `${orangeBase()}/webpayment`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_key: env("ORANGE_MONEY_MERCHANT_KEY"),
        currency: orangeEnv() === "production" ? (env("ORANGE_MONEY_CURRENCY") ?? "XAF") : "OUV",
        order_id: input.orderId,
        amount: Math.round(input.amount),
        return_url: `${base}/paiements?retour=orange`,
        cancel_url: `${base}/paiements?retour=annule`,
        notif_url: `${base}/api/payments/webhooks/orange`,
        lang: "fr",
        reference: input.reference
      })
    },
    "Orange Money"
  );
  if (status === 401) orangeTokenCache = null;
  const payToken = text(json?.pay_token);
  const paymentUrl = text(json?.payment_url);
  if (![200, 201].includes(status) || !payToken || !paymentUrl) throw new ProviderError(`Orange Money a refusé la demande (code ${status}).`, status >= 500);
  return { payToken, paymentUrl, notifToken: text(json?.notif_token) };
}

export async function orangeCheck(input: { orderId: string; amount: number; payToken: string }): Promise<{ status: RemoteStatus; reference?: string }> {
  const token = await orangeToken();
  const { status, json } = await http(
    `${orangeBase()}/transactionstatus`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ order_id: input.orderId, amount: Math.round(input.amount), pay_token: input.payToken })
    },
    "Orange Money"
  );
  if (status === 401) orangeTokenCache = null;
  if (status !== 200) throw new ProviderError(`Orange Money : vérification impossible (code ${status}).`, true);
  const remote = text(json?.status)?.toUpperCase();
  if (remote === "SUCCESS" || remote === "SUCCESSFUL") return { status: "success", reference: text(json?.txnid) };
  if (remote === "FAILED") return { status: "failed" };
  if (remote === "EXPIRED") return { status: "expired" };
  return { status: "pending" };
}
