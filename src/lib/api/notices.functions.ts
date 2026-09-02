import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireAppAuth } from "@/lib/auth-middleware";

export const listPublicNotices = createServerFn({ method: "GET" }).handler(async () => {
  const backendUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const publishableKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!backendUrl || !publishableKey) {
    throw new Error("Backend configuration is unavailable in this deployment.");
  }
  const sb = createClient(backendUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("notices")
    .select("id, title, body, audience, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listNotices = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const authorIds = Array.from(new Set(rows.map((r: any) => r.created_by).filter(Boolean)));
    let authorMap = new Map<string, string>();
    if (authorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name, email").in("id", authorIds);
      authorMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    }
    return rows.map((r: any) => ({ ...r, author_name: authorMap.get(r.created_by) ?? null }));
  });

export const createNotice = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
    audience: z.enum(["trainers", "all"]).default("trainers"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { error } = await context.supabase.from("notices").insert({
      title: data.title, body: data.body, audience: data.audience, created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNotice = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
    audience: z.enum(["trainers", "all"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notices").update({
      title: data.title, body: data.body, audience: data.audience,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotice = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
