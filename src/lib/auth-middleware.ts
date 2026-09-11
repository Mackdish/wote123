import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createBackendFetch(publishableKey: string, storageSecretKey?: string, backendUrl?: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isGeneratedBundleStorageRequest =
      Boolean(storageSecretKey && backendUrl) &&
      requestUrl.startsWith(`${backendUrl.replace(/\/$/, "")}/storage/v1/object/`) &&
      (requestUrl.includes("/upload/sign/") || requestUrl.includes("/sign/")) &&
      (requestUrl.includes("/_library/") || requestUrl.includes("/_bundles/"));

    if (isGeneratedBundleStorageRequest) {
      // Generated Library/Bundle archives are authorized by the server functions
      // before they reach Storage. Use the server-only secret key here so these
      // internal archive paths do not depend on Storage INSERT/SELECT RLS policies.
      headers.set("apikey", storageSecretKey!);
      headers.set("Authorization", `Bearer ${storageSecretKey!}`);
    } else {
      if (
        publishableKey.startsWith("sb_publishable_") &&
        headers.get("Authorization") === `Bearer ${publishableKey}`
      ) {
        headers.delete("Authorization");
      }
      headers.set("apikey", publishableKey);
    }

    return fetch(input, { ...init, headers });
  };
}

export const requireAppAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    // VITE_* values are intentionally public and embedded at build time. The
    // fallback keeps external Worker deployments functional without secrets.
    const backendUrl =
      process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
    const publishableKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ||
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const storageSecretKey =
      process.env["SUPABASE_SECRET_KEY"] ||
      process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!backendUrl || !publishableKey) {
      throw new Error("Backend configuration is unavailable in this deployment.");
    }

    const request = getRequest();
    const authHeader = request?.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length);
    if (!token || token.split(".").length !== 3) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const backend = createClient<Database>(backendUrl, publishableKey, {
      global: {
        fetch: createBackendFetch(publishableKey, storageSecretKey, backendUrl),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await backend.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase: backend,
        userId,
        claims: data.claims,
      },
    });
  },
);
