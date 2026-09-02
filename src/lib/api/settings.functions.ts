import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";
import type { AppRole } from "@/lib/types";

const roleEnum = z.enum(["admin", "trainer", "hod", "deputy_principal", "iqa"]);
const docTypeEnum = z.enum([
  "scheme_of_work", "session_plan", "record_of_work", "training_program", "learning_plan",
  "lesson_notes", "assessment_document", "iqa_document", "course_outline", "other",
]);

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw new Error("Forbidden: admin only");
}

async function logAudit(supabase: any, action: string, details: Record<string, unknown>) {
  await supabase.rpc("log_audit", { _action: action, _details: details });
}

// ---------------------------------------------------------------- permissions

export const listReportPermissions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("report_permissions").select("role, can_view_reports").order("role");
    return (data ?? []) as Array<{ role: AppRole; can_view_reports: boolean }>;
  });

export const setReportPermission = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ role: roleEnum, can_view_reports: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { error } = await supabase
      .from("report_permissions")
      .upsert({ role: data.role, can_view_reports: data.can_view_reports, updated_at: new Date().toISOString() }, { onConflict: "role" });
    if (error) throw new Error(error.message);
    await logAudit(supabase, "admin.report_permission_changed", { role: data.role, can_view_reports: data.can_view_reports });
    return { ok: true };
  });

export const myReportAccess = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("can_view_reports", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    return { allowed: Boolean(data) };
  });

export const listLibraryPermissions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("library_permissions").select("role, can_view_library").order("role");
    return (data ?? []) as Array<{ role: AppRole; can_view_library: boolean }>;
  });

export const setLibraryPermission = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ role: roleEnum, can_view_library: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { error } = await supabase
      .from("library_permissions")
      .upsert({ role: data.role, can_view_library: data.can_view_library, updated_at: new Date().toISOString() }, { onConflict: "role" });
    if (error) throw new Error(error.message);
    await logAudit(supabase, "admin.library_permission_changed", { role: data.role, can_view_library: data.can_view_library });
    return { ok: true };
  });

export const myLibraryAccess = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("can_view_library", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    return { allowed: Boolean(data) };
  });

// ------------------------------------------------------------- document types

export const listDocumentTypeSettings = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("document_type_settings")
      .select("document_type, label, active, sort_order")
      .order("sort_order");
    return data ?? [];
  });

export const updateDocumentTypeSetting = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    document_type: docTypeEnum,
    label: z.string().trim().min(2).max(80).optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const patch: any = { updated_at: new Date().toISOString() };
    if (data.label !== undefined) patch.label = data.label;
    if (data.active !== undefined) patch.active = data.active;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    const { error } = await supabase
      .from("document_type_settings").update(patch).eq("document_type", data.document_type);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------------------------------------------------- deadlines

export const listDeadlines = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: rows }, { data: depts }] = await Promise.all([
      supabase.from("submission_deadlines").select("*").order("due_date"),
      supabase.from("departments").select("id, name"),
    ]);
    const dMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    return (rows ?? []).map((r: any) => ({
      ...r,
      department_name: r.department_id ? dMap.get(r.department_id) ?? null : null,
    }));
  });

export const upsertDeadline = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    document_type: docTypeEnum,
    department_id: z.string().uuid().nullable().optional(),
    academic_year: z.string().trim().max(20).nullable().optional(),
    term: z.string().trim().max(20).nullable().optional(),
    due_date: z.string().min(8),
    allow_late: z.boolean().default(true),
    notes: z.string().trim().max(500).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const row = {
      document_type: data.document_type,
      department_id: data.department_id ?? null,
      academic_year: data.academic_year || null,
      term: data.term || null,
      due_date: data.due_date,
      allow_late: data.allow_late,
      notes: data.notes || null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabase.from("submission_deadlines").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("submission_deadlines").insert(row);
      if (error) throw new Error(error.message);
    }
    await logAudit(supabase, "admin.deadline_saved", { ...row });
    return { ok: true };
  });

export const deleteDeadline = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { error } = await supabase.from("submission_deadlines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(supabase, "admin.deadline_deleted", { id: data.id });
    return { ok: true };
  });

// ----------------------------------------------------------- homepage images

async function signImages(supabase: any, rows: any[]) {
  const signed = await Promise.all(
    rows.map((r) => supabase.storage.from("site-images").createSignedUrl(r.storage_path, 60 * 60 * 12)),
  );
  return rows.map((r, i) => ({ ...r, url: signed[i]?.data?.signedUrl ?? null }));
}

export const listHomepageImages = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("homepage_images").select("*").order("sort_order").order("created_at");
    return signImages(context.supabase, data ?? []);
  });

export const addHomepageImage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    storage_path: z.string().min(1),
    caption: z.string().trim().max(200).nullable().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { error } = await supabase.from("homepage_images").insert({
      storage_path: data.storage_path,
      caption: data.caption || null,
      sort_order: data.sort_order ?? 0,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAudit(supabase, "admin.homepage_image_added", { storage_path: data.storage_path });
    return { ok: true };
  });

export const updateHomepageImage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    caption: z.string().trim().max(200).nullable().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
    active: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const patch: any = {};
    if (data.caption !== undefined) patch.caption = data.caption || null;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await supabase.from("homepage_images").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteHomepageImage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { data: row } = await supabase
      .from("homepage_images").select("storage_path").eq("id", data.id).maybeSingle();
    const { error } = await supabase.from("homepage_images").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.storage_path) {
      await supabase.storage.from("site-images").remove([row.storage_path]);
    }
    await logAudit(supabase, "admin.homepage_image_deleted", { id: data.id });
    return { ok: true };
  });

// -------------------------------------------------- public homepage gallery

export const listPublicHomepageImages = createServerFn({ method: "GET" }).handler(async () => {
  const backendUrl = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const publishableKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!backendUrl || !publishableKey) return [];
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(backendUrl, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("homepage_images")
    .select("id, storage_path, caption, sort_order")
    .eq("active", true)
    .order("sort_order")
    .limit(12);
  if (error) return [];
  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map((r) => sb.storage.from("site-images").createSignedUrl(r.storage_path, 60 * 60 * 12)),
  );
  return rows.map((r, i) => ({
    id: r.id,
    caption: r.caption,
    url: signed[i]?.data?.signedUrl ?? null,
  }));
});
