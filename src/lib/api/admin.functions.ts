import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";
import type { AppRole } from "@/lib/types";

const roleEnum = z.enum(["admin", "trainer", "hod", "deputy_principal", "iqa"]);

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw new Error("Forbidden: admin only");
}

async function logAudit(supabase: any, action: string, details: Record<string, unknown>) {
  await supabase.rpc("log_audit", { _action: action, _details: details });
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const [{ data: profiles }, { data: roles }, { data: depts }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("departments").select("id, name"),
    ]);

    const rMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rMap.get(r.user_id) ?? [];
      list.push(r.role);
      rMap.set(r.user_id, list);
    }
    const dMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    const WINDOW_MS = USER_RESTORE_WINDOW_DAYS * 86_400_000;

    const users = (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rMap.get(p.id) ?? [],
      department_name: p.department_id ? dMap.get(p.department_id) ?? null : null,
      restore_until: p.deleted_at ? new Date(new Date(p.deleted_at).getTime() + WINDOW_MS).toISOString() : null,
      missing_profile: false,
    }));

    return users.sort((a: any, b: any) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
  });


export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().uuid(),
    full_name: z.string().trim().max(200).optional(),
    department_id: z.string().uuid().nullable().optional(),
    status: z.boolean().optional(),
    roles: z.array(roleEnum).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const patch: any = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.department_id !== undefined) patch.department_id = data.department_id;
    if (data.status !== undefined) patch.status = data.status;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("profiles").update(patch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }
    if (data.roles) {
      await supabase.from("user_roles").delete().eq("user_id", data.user_id);
      if (data.roles.length) {
        await supabase.from("user_roles").insert(data.roles.map((r) => ({ user_id: data.user_id, role: r as AppRole })));
      }
    }
    if (data.roles?.includes("hod") && data.department_id) {
      await supabase.from("departments").update({ hod_id: data.user_id }).eq("id", data.department_id);
    } else if (data.roles && !data.roles.includes("hod")) {
      await supabase.from("departments").update({ hod_id: null }).eq("hod_id", data.user_id);
    }
    return { ok: true };
  });

// Users register themselves at /auth. Administrators then assign roles and
// departments from User Management — no invitations or pre-registration.



// Recovery window (days) during which a deleted user can be restored.
export const USER_RESTORE_WINDOW_DAYS = 30;

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account.");
    const { data: target } = await supabase
      .from("profiles").select("email, full_name, deleted_at").eq("id", data.user_id).maybeSingle();
    if (!target) throw new Error("User not found");
    if (target.deleted_at) throw new Error("User is already deleted");

    // Snapshot current roles so we can restore them exactly.
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", data.user_id);
    const roleSnapshot = (roleRows ?? []).map((r: any) => r.role);

    // Soft-delete: keep the account + profile + documents intact so a restore is possible.
    // Remove role grants and deactivate so the user has no access if they sign in.
    await supabase.from("user_roles").delete().eq("user_id", data.user_id);
    await supabase.from("departments").update({ hod_id: null }).eq("hod_id", data.user_id);
    const { error: upErr } = await supabase.from("profiles").update({
      status: false,
      deleted_at: new Date().toISOString(),
      deleted_by: context.userId,
      deleted_roles: roleSnapshot,
    }).eq("id", data.user_id);
    if (upErr) throw new Error(upErr.message);

    await logAudit(supabase, "admin.user_deleted", {
      deleted_user_id: data.user_id,
      email: target.email ?? null,
      full_name: target.full_name ?? null,
      roles_snapshot: roleSnapshot,
      restore_until: new Date(Date.now() + USER_RESTORE_WINDOW_DAYS * 86_400_000).toISOString(),
    });
    return { ok: true };
  });

export const adminRestoreUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { data: target } = await supabase
      .from("profiles")
      .select("email, full_name, deleted_at, deleted_roles")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!target) throw new Error("User not found");
    if (!target.deleted_at) throw new Error("User is not deleted");

    const deletedAt = new Date(target.deleted_at).getTime();
    const ageDays = (Date.now() - deletedAt) / 86_400_000;
    if (ageDays > USER_RESTORE_WINDOW_DAYS) {
      throw new Error(`Recovery window expired (${USER_RESTORE_WINDOW_DAYS} days). This account can no longer be restored.`);
    }

    const rolesToRestore: AppRole[] = ((target.deleted_roles as AppRole[] | null) ?? []);
    await supabase.from("user_roles").delete().eq("user_id", data.user_id);
    if (rolesToRestore.length) {
      await supabase.from("user_roles").insert(rolesToRestore.map((r) => ({ user_id: data.user_id, role: r })));
    }
    const { error: upErr } = await supabase.from("profiles").update({
      status: true,
      deleted_at: null,
      deleted_by: null,
      deleted_roles: null,
    }).eq("id", data.user_id);
    if (upErr) throw new Error(upErr.message);

    await logAudit(supabase, "admin.user_restored", {
      restored_user_id: data.user_id,
      email: target.email ?? null,
      full_name: target.full_name ?? null,
      roles_restored: rolesToRestore,
    });
    return { ok: true };
  });

export const logStampedDownload = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ document_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase.from("documents").select("title").eq("id", data.document_id).maybeSingle();
    await logAudit(supabase, "document.stamped_pdf_downloaded", {
      document_id: data.document_id, title: doc?.title ?? null, downloaded_at: new Date().toISOString(),
    });
    return { ok: true };
  });

export const adminListDepartments = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("departments").select("*").order("name");
    return data ?? [];
  });

export const adminUpsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100),
    hod_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    let deptId = data.id ?? null;
    if (data.id) {
      const { error } = await supabase.from("departments").update({ name: data.name, hod_id: data.hod_id ?? null }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase.from("departments").insert({ name: data.name, hod_id: data.hod_id ?? null }).select("id").single();
      if (error) throw new Error(error.message);
      deptId = created?.id ?? null;
    }
    if (data.hod_id && deptId) {
      const { error: pErr } = await supabase.from("profiles").update({ department_id: deptId }).eq("id", data.hod_id);
      if (pErr) throw new Error(pErr.message);
      const { error: rErr } = await supabase.from("user_roles").upsert({ user_id: data.hod_id, role: "hod" as AppRole }, { onConflict: "user_id,role" });
      if (rErr) throw new Error(rErr.message);
    }
    return { ok: true };
  });

export const adminDeleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { error } = await supabase.from("departments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    await requireAdmin(supabase, context.userId);
    const { data: logs } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    const rows = logs ?? [];

    // Enrich with linked document + actor info
    const docIds = Array.from(
      new Set(rows.map((r: any) => r.details?.document_id).filter(Boolean) as string[]),
    );
    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean) as string[]));

    const [{ data: docs }, { data: users }] = await Promise.all([
      docIds.length
        ? supabase
            .from("documents")
            .select("id, title, document_type, status, academic_year, department_id")
            .in("id", docIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const deptIds = Array.from(
      new Set((docs ?? []).map((d: any) => d.department_id).filter(Boolean) as string[]),
    );
    const { data: depts } = deptIds.length
      ? await supabase.from("departments").select("id, name").in("id", deptIds)
      : { data: [] as any[] };

    const dMap = new Map((docs ?? []).map((d: any) => [d.id, d]));
    const uMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    return rows.map((r: any) => {
      const doc = r.details?.document_id ? dMap.get(r.details.document_id) : null;
      return {
        ...r,
        actor: uMap.get(r.user_id) ?? null,
        document: doc
          ? {
              id: doc.id,
              title: doc.title,
              document_type: doc.document_type,
              status: doc.status,
              academic_year: doc.academic_year,
              department_id: doc.department_id,
              department_name: doc.department_id ? deptMap.get(doc.department_id) ?? null : null,
            }
          : null,
      };
    });
  });

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("departments").select("id, name").order("name");
    return data ?? [];
  });

// Returns whether ANY admin exists. Used by the bootstrap UI.
export const adminExists = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_exists");
    if (error) throw new Error(error.message);
    return { exists: Boolean(data) };
  });

// One-time self-promotion: caller becomes admin IFF no admin exists yet.
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("claim_first_admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Profiles visible to the caller (RLS-scoped), used to render a folder for
// every trainer in a department even when they have no documents yet.
export const listVisibleProfiles = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data: canView } = await context.supabase.rpc("can_view_library", { _user_id: context.userId });
    if (!canView) throw new Error("Forbidden: the Document Library is limited to the Deputy Principal and Administrators.");
    const { data } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, department_id, deleted_at")
      .order("full_name");
    return (data ?? []).filter((p: any) => !p.deleted_at);
  });
