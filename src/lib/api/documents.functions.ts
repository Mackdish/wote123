import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";
import type { AppRole, DocumentStatus, DocumentType } from "@/lib/types";
import JSZip from "jszip";

const REVIEW_STAGES: Record<string, DocumentStatus[]> = {
  all: [],
  approved: ["approved"],
  awaiting_dp: ["pending_dp"],
  qa_cleared: ["pending_dp", "approved"],
  in_review: ["pending_hod", "pending_iqa", "pending_dp"],
  rejected: ["rejected_hod", "rejected_iqa", "rejected_dp"],
};

const submitSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  document_type: z.enum([
    "scheme_of_work", "session_plan", "record_of_work", "training_program", "learning_plan",
    "lesson_notes", "assessment_document", "iqa_document", "course_outline", "other",
  ]),
  subject: z.string().trim().max(200).optional().nullable(),
  course: z.string().trim().max(200).optional().nullable(),
  class_name: z.string().trim().max(100).optional().nullable(),
  academic_year: z.string().trim().max(20).optional().nullable(),
  term: z.string().trim().max(20).optional().nullable(),
  week: z.string().trim().max(20).optional().nullable(),
  session: z.string().trim().max(50).optional().nullable(),
  file_path: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  parent_document_id: z.string().uuid().optional().nullable(),
});

async function notify(supabase: any, userIds: string[], title: string, message: string, link?: string) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return;
  await supabase.rpc("notify_users", { _user_ids: ids, _title: title, _message: message, _link: link ?? null });
}

async function logAudit(supabase: any, action: string, details: Record<string, unknown>) {
  await supabase.rpc("log_audit", { _action: action, _details: details });
}

async function usersWithRole(supabase: any, role: AppRole, departmentId: string | null): Promise<string[]> {
  const { data } = await supabase.rpc("users_with_role_in_department", { _role: role, _department_id: departmentId });
  if (!data) return [];
  return (data as any[]).map((r) => (typeof r === "string" ? r : r.users_with_role_in_department)).filter(Boolean);
}

async function getRoles(supabase: any, userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data?.map((r: any) => r.role) ?? []) as AppRole[];
}

async function getActor(supabase: any, userId: string) {
  let [{ data: profile }, roles] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, department_id").eq("id", userId).maybeSingle(),
    getRoles(supabase, userId),
  ]);
  if (!profile) {
    await supabase.rpc("ensure_my_profile");
    const { data: created } = await supabase
      .from("profiles").select("id, full_name, email, department_id").eq("id", userId).maybeSingle();
    profile = created ?? null;
    if (!roles.length) roles = await getRoles(supabase, userId);
  }
  return { profile, roles, departmentId: profile?.department_id ?? null };
}

const IQA_VISIBLE_STATUSES: DocumentStatus[] = ["pending_iqa", "rejected_iqa", "pending_dp", "rejected_dp", "approved"];
const DP_VISIBLE_STATUSES: DocumentStatus[] = ["pending_dp", "rejected_dp", "approved"];

function canViewDocumentRow(doc: any, roles: AppRole[], userId: string, departmentId: string | null) {
  if (roles.includes("admin")) return true;
  if (doc.trainer_id === userId) return true;
  if (roles.includes("hod") && departmentId && doc.department_id === departmentId) return true;
  if (roles.includes("iqa") && departmentId && doc.department_id === departmentId && IQA_VISIBLE_STATUSES.includes(doc.status)) return true;
  if (roles.includes("deputy_principal") && DP_VISIBLE_STATUSES.includes(doc.status)) return true;
  return false;
}

// Reads run as the signed-in user; row-level security decides what is returned.
async function listAccessibleDocumentRows(supabase: any, userId: string, includeAllVersions?: boolean) {
  const { roles, departmentId } = await getActor(supabase, userId);
  let q = supabase
    .from("documents")
    .select("id, title, document_type, status, subject, course, class_name, academic_year, term, week, created_at, trainer_id, department_id, parent_document_id, version_number, is_current, file_name")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!includeAllVersions) q = q.or("is_current.eq.true,status.neq.approved");
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  return (rows ?? []).filter((doc: any) => canViewDocumentRow(doc, roles, userId, departmentId));
}

export const submitDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("department_id, full_name").eq("id", userId).maybeSingle();
    let deptId = profile?.department_id || data.department_id || null;
    if (data.parent_document_id) {
      const { data: parent } = await supabase
        .from("documents").select("department_id, trainer_id")
        .eq("id", data.parent_document_id).maybeSingle();
      if (!parent) throw new Error("Parent document not found or not accessible");
      if (parent.trainer_id !== userId) throw new Error("Only the original trainer can upload a new version");
      deptId = parent.department_id ?? deptId;
    }
    if (!deptId) {
      throw new Error("Your account has no department assigned. Ask an administrator to set your department, or pick one on this form, so your HOD can see the submission.");
    }
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({ ...data, trainer_id: userId, department_id: deptId, status: "pending_hod" as DocumentStatus })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("approval_history").insert({
      document_id: doc.id, approver_id: userId, role: "trainer", action: "submitted",
      comment: `Submitted by ${profile?.full_name ?? "trainer"}`,
    });

    const hodIds = new Set<string>(await usersWithRole(supabase, "hod", deptId));
    const { data: deptRow } = await supabase.from("departments").select("hod_id").eq("id", deptId).maybeSingle();
    if (deptRow?.hod_id) hodIds.add(deptRow.hod_id);
    await notify(supabase, Array.from(hodIds), "New submission for review",
      `"${doc.title}" is awaiting your review.`, `/documents/${doc.id}`);
    return { id: doc.id };
  });

const actionSchema = z.object({
  document_id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export const reviewDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => actionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { roles, departmentId } = await getActor(supabase, userId);
    const { data: doc, error } = await supabase.from("documents").select("*").eq("id", data.document_id).maybeSingle();
    if (error || !doc) throw new Error("Document not found");
    if (!canViewDocumentRow(doc, roles, userId, departmentId)) throw new Error("You cannot access this document.");

    let nextStatus: DocumentStatus | null = null;
    let stageRole: AppRole | null = null;

    if (doc.status === "pending_hod" && roles.includes("hod") && departmentId && doc.department_id === departmentId) {
      stageRole = "hod";
      nextStatus = data.action === "approve" ? "pending_iqa" : "rejected_hod";
    } else if (doc.status === "pending_iqa" && roles.includes("iqa") && departmentId && doc.department_id === departmentId) {
      stageRole = "iqa";
      // IQA approval is final — Deputy Principal no longer reviews.
      nextStatus = data.action === "approve" ? "approved" : "rejected_iqa";
    } else {
      throw new Error("You cannot review this document at its current stage.");
    }

    const { error: upErr } = await supabase.from("documents").update({ status: nextStatus }).eq("id", doc.id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("approval_history").insert({
      document_id: doc.id, approver_id: userId, role: stageRole, action: data.action, comment: data.comment ?? null,
    });

    await notify(supabase, [doc.trainer_id],
      data.action === "approve" ? "Your document moved forward" : "Your document was returned",
      `"${doc.title}" — ${data.action === "approve" ? "approved" : "rejected"} at ${stageRole.toUpperCase()} stage.`,
      `/documents/${doc.id}`);

    if (data.action === "approve") {
      if (nextStatus === "pending_iqa") {
        const iqaIds = await usersWithRole(supabase, "iqa", doc.department_id ?? null);
        await notify(supabase, iqaIds, "Document awaiting IQA review",
          `"${doc.title}" is ready for quality assurance.`, `/documents/${doc.id}`);
      } else if (nextStatus === "approved") {
        const [hodIds, dpIds, adminIds] = await Promise.all([
          usersWithRole(supabase, "hod", doc.department_id ?? null),
          usersWithRole(supabase, "deputy_principal", null),
          usersWithRole(supabase, "admin", null),
        ]);
        await notify(supabase, [...hodIds, ...dpIds, ...adminIds],
          "Document finally approved", `"${doc.title}" has received final approval.`, `/documents/${doc.id}`);
      }
    }

    await logAudit(supabase, `document.${data.action}`, { document_id: doc.id, stage: stageRole });
    return { ok: true };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) =>
    z.object({ include_all_versions: z.boolean().optional() }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = await listAccessibleDocumentRows(supabase, userId, data?.include_all_versions);
    const trainerIds: string[] = Array.from(new Set((rows ?? []).map((d: any) => d.trainer_id).filter(Boolean)));
    const deptIds: string[] = Array.from(new Set((rows ?? []).map((d: any) => d.department_id).filter(Boolean)));
    const [{ data: trainers }, { data: depts }] = await Promise.all([
      trainerIds.length ? supabase.from("profiles").select("id, full_name").in("id", trainerIds) : Promise.resolve({ data: [] as any[] }),
      deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const tMap = new Map((trainers ?? []).map((t: any) => [t.id, t.full_name]));
    const dMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    return (rows ?? []).map((d: any) => ({
      ...d,
      trainer_name: tMap.get(d.trainer_id) ?? "Unknown",
      department_name: d.department_id ? dMap.get(d.department_id) ?? null : null,
    }));
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { roles, departmentId } = await getActor(supabase, userId);
    const { data: doc, error } = await supabase.from("documents").select("*").eq("id", data.id).maybeSingle();
    if (error || !doc) throw new Error("Document not found");
    if (!canViewDocumentRow(doc, roles, userId, departmentId)) throw new Error("Document not found");
    const { data: history } = await supabase
      .from("approval_history").select("*").eq("document_id", data.id).order("created_at", { ascending: true });
    const ids = Array.from(new Set([doc.trainer_id, ...((history ?? []).map((h: any) => h.approver_id))]));
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    let dept: { id: string; name: string } | null = null;
    if (doc.department_id) {
      const { data: d } = await supabase.from("departments").select("id, name").eq("id", doc.department_id).maybeSingle();
      dept = d ?? null;
    }
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 30, { download: doc.file_name });
    let rootId = doc.id;
    let cursorParent: string | null = doc.parent_document_id ?? null;
    while (cursorParent) {
      const { data: p } = await supabase
        .from("documents").select("id, parent_document_id").eq("id", cursorParent).maybeSingle();
      if (!p) break;
      rootId = p.id;
      cursorParent = p.parent_document_id ?? null;
    }
    const { data: chainRows } = await supabase
      .from("documents")
      .select("id, version_number, status, is_current, created_at, file_name")
      .or(`id.eq.${rootId},parent_document_id.eq.${rootId}`)
      .order("version_number", { ascending: false });
    const chain = (chainRows ?? []).filter((row: any) => row.id === doc.id || canViewDocumentRow({ ...doc, ...row }, roles, userId, departmentId));
    return {
      doc,
      trainer: pMap.get(doc.trainer_id) ?? null,
      department: dept,
      history: (history ?? []).map((h: any) => ({ ...h, approver: pMap.get(h.approver_id) ?? null })),
      file_url: signed?.signedUrl ?? null,
      versions: chain ?? [],
    };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const data = await listAccessibleDocumentRows(supabase, userId, true);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const total = data?.length ?? 0;
    return { total, counts };
  });

export const getApprovedBundle = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ department_id: z.string().uuid().nullable().optional() }).optional().parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    if (!roles.includes("deputy_principal") && !roles.includes("admin")) {
      throw new Error("Forbidden");
    }
    let q = supabase
      .from("documents")
      .select("id, title, file_path, file_name, document_type, academic_year, department_id")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (data?.department_id) q = q.eq("department_id", data.department_id);
    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    const deptIds: string[] = Array.from(new Set((docs ?? []).map((d: any) => d.department_id).filter(Boolean)));
    const deptRes = deptIds.length
      ? await supabase.from("departments").select("id, name").in("id", deptIds)
      : { data: [] as any[] };
    const dMap = new Map((deptRes.data ?? []).map((d: any) => [d.id, d.name]));
    const docIds = (docs ?? []).map((d: any) => d.id);
    const historyRes = docIds.length
      ? await supabase
          .from("approval_history")
          .select("document_id, role, action, approver_id, created_at")
          .in("document_id", docIds)
          .eq("action", "approve")
          .in("role", ["hod", "iqa"])
      : { data: [] as any[] };
    const history = historyRes.data ?? [];
    const approverIds = Array.from(new Set(history.map((h: any) => h.approver_id).filter(Boolean)));
    const approversRes = approverIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", approverIds)
      : { data: [] as any[] };
    const aMap = new Map((approversRes.data ?? []).map((p: any) => [p.id, p]));
    const stampsByDoc = new Map<string, any[]>();
    for (const h of history) {
      const approver: any = aMap.get(h.approver_id);
      const list = stampsByDoc.get(h.document_id) ?? [];
      list.push({
        role: h.role,
        approverName: approver?.full_name || approver?.email || null,
        date: h.created_at,
      });
      stampsByDoc.set(h.document_id, list);
    }
    const CONCURRENCY = 12;
    const signedResults: Array<{ data: { signedUrl: string | null } | null; error: any }> = [];
    for (let i = 0; i < (docs ?? []).length; i += CONCURRENCY) {
      const batch = (docs ?? []).slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((d: any) => supabase.storage.from("documents").createSignedUrl(d.file_path, 60 * 60)),
      );
      signedResults.push(...batchResults);
    }
    const items = [];
    for (let i = 0; i < (docs ?? []).length; i++) {
      const d: any = (docs ?? [])[i];
      const signed = signedResults[i]?.data;
      if (signed?.signedUrl) {
        items.push({
          id: d.id, title: d.title, file_name: d.file_name, document_type: d.document_type,
          academic_year: d.academic_year, department_id: d.department_id,
          department_name: d.department_id ? dMap.get(d.department_id) ?? null : null,
          url: signed.signedUrl,
          stamps: stampsByDoc.get(d.id) ?? [],
        });
      }
    }
    return items;
  });

// ============================================================
// Bundle cache — precomputed ZIP archives of approved documents
// ============================================================

async function computeBundleSignature(supabase: any, departmentId: string | null): Promise<{ signature: string; doc_count: number; latest: string | null }> {
  let q = supabase.from("documents").select("id, created_at").eq("status", "approved").order("id", { ascending: true });
  if (departmentId) q = q.eq("department_id", departmentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; created_at: string }>;
  const payload = rows.map((r) => `${r.id}`).join("|");
  const bytes = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const signature = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const latest = rows.length ? rows.map((r) => r.created_at).sort().slice(-1)[0] : null;
  return { signature, doc_count: rows.length, latest };
}

async function assertBundleRole(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("admin") && !roles.includes("deputy_principal")) throw new Error("Forbidden");
}

export const getBundleCache = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ department_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertBundleRole(supabase, userId);
    const departmentId = data?.department_id ?? null;
    const { signature, doc_count } = await computeBundleSignature(supabase, departmentId);
    let q = supabase.from("bundle_cache").select("*").eq("signature", signature).limit(1);
    q = departmentId ? q.eq("department_id", departmentId) : q.is("department_id", null);
    const { data: rows } = await q;
    const row: any = rows?.[0] ?? null;
    let cached: { url: string; created_at: string; size_bytes: number; doc_count: number } | null = null;
    if (row) {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(row.storage_path, 60 * 60);
      if (signed?.signedUrl) {
        cached = { url: signed.signedUrl, created_at: row.created_at, size_bytes: row.size_bytes, doc_count: row.doc_count };
      }
    }
    return { signature, doc_count, cached };
  });

export const createBundleUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    department_id: z.string().uuid().nullable().optional(),
    signature: z.string().min(8).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertBundleRole(supabase, userId);
    const scope = data.department_id ?? "all";
    const path = `_bundles/${scope}-${data.signature}-${Date.now()}.zip`;
    const { data: signed, error } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Failed to create upload URL");
    return { path: signed.path, token: signed.token };
  });

export const finalizeBundleCache = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    department_id: z.string().uuid().nullable().optional(),
    signature: z.string().min(8).max(64),
    storage_path: z.string().min(1),
    doc_count: z.number().int().nonnegative(),
    size_bytes: z.number().int().nonnegative(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertBundleRole(supabase, userId);
    const departmentId = data.department_id ?? null;

    let staleQ = supabase.from("bundle_cache").select("id, storage_path").neq("signature", data.signature);
    staleQ = departmentId ? staleQ.eq("department_id", departmentId) : staleQ.is("department_id", null);
    const { data: stale } = await staleQ;
    if (stale?.length) {
      const paths = stale.map((r: any) => r.storage_path).filter(Boolean);
      if (paths.length) await supabase.storage.from("documents").remove(paths);
      await supabase.from("bundle_cache").delete().in("id", stale.map((r: any) => r.id));
    }

    let sameQ = supabase.from("bundle_cache").delete().eq("signature", data.signature);
    sameQ = departmentId ? sameQ.eq("department_id", departmentId) : sameQ.is("department_id", null);
    await sameQ;

    await supabase.from("bundle_cache").insert({
      department_id: departmentId,
      signature: data.signature,
      storage_path: data.storage_path,
      doc_count: data.doc_count,
      size_bytes: data.size_bytes,
      created_by: userId,
    });

    const { data: signed } = await supabase.storage.from("documents").createSignedUrl(data.storage_path, 60 * 60);
    return { url: signed?.signedUrl ?? null };
  });

const deleteSchema = z.object({ document_id: z.string().uuid() });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    if (!roles.includes("admin") && !roles.includes("deputy_principal")) {
      throw new Error("Only administrators or the deputy principal can delete documents.");
    }
    const { data: doc, error } = await supabase
      .from("documents").select("id, file_path, title").eq("id", data.document_id).maybeSingle();
    if (error || !doc) throw new Error("Document not found");
    if (doc.file_path) {
      await supabase.storage.from("documents").remove([doc.file_path]);
    }
    const { error: delErr } = await supabase.from("documents").delete().eq("id", doc.id);
    if (delErr) throw new Error(delErr.message);
    await logAudit(supabase, "document.delete", { document_id: doc.id, title: doc.title });
    return { ok: true };
  });

// ============================================================
// Library folder download (server-side zip build)
// ============================================================

const libraryDownloadSchema = z.object({
  department_id: z.string().uuid(),
  trainer_id: z.string().uuid().nullable().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  year: z.string().optional(),
  term: z.string().optional(),
});

export const downloadLibraryFolder = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => libraryDownloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: canView } = await supabase.rpc("can_view_library", { _user_id: userId });
    if (!canView) throw new Error("Forbidden: the Document Library is limited to the Deputy Principal and Administrators.");

    let q = supabase
      .from("documents")
      .select("id, title, file_path, file_name, document_type, trainer_id, department_id")
      .order("created_at", { ascending: false });
    q = q.eq("department_id", data.department_id);
    if (data.trainer_id) q = q.eq("trainer_id", data.trainer_id);

    const stageStatuses = (data.stage ? REVIEW_STAGES[data.stage] : []) ?? [];
    if (stageStatuses.length) {
      const statusOrs = stageStatuses.map((s) => `status.eq.${s}`).join(",");
      q = q.or(statusOrs);
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.type && data.type !== "all") q = q.eq("document_type", data.type);
    if (data.year && data.year !== "all") q = q.eq("academic_year", data.year);
    if (data.term && data.term !== "all") q = q.eq("term", data.term);

    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    if (!docs?.length) throw new Error("No documents match these filters.");

    const trainerIds = Array.from(new Set(docs.map((d: any) => d.trainer_id).filter(Boolean)));
    const deptIds = Array.from(new Set(docs.map((d: any) => d.department_id).filter(Boolean)));
    const [{ data: trainers }, { data: depts }] = await Promise.all([
      trainerIds.length ? supabase.from("profiles").select("id, full_name").in("id", trainerIds) : Promise.resolve({ data: [] as any[] }),
      deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const trainerMap = new Map((trainers ?? []).map((t: any) => [t.id, t.full_name || t.email || "Unknown"]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    const zip = new JSZip({ compression: "STORE" });
    const CONCURRENCY = 12;
    let ok = 0;
    let failed = 0;

    for (let i = 0; i < docs.length; i += CONCURRENCY) {
      const batch = docs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (d: any) => {
        try {
          const { data: fileBlob, error: downloadError } = await supabase.storage.from("documents").download(d.file_path);
          if (downloadError || !fileBlob) { failed++; return; }

          const trainerName = trainerMap.get(d.trainer_id) || "Unknown";
          const typeLabel = DOC_TYPE_LABELS[d.document_type as DocumentType] || "Documents";
          const safeFileName = (d.file_name || `${d.title}.bin`).replace(/[\/\\?%*:|"<>]/g, "_");
          const folderPath = data.trainer_id ? typeLabel : `${trainerName}/${typeLabel}`;
          zip.folder(folderPath)!.file(safeFileName, fileBlob);
          ok++;
        } catch (err) {
          console.error("[library-zip] failed to add", d.id, err);
          failed++;
        }
      }));
    }

    if (!ok) throw new Error("Could not package any files");

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const payload = docs.map((d: any) => d.id).join("|");
    const hashBytes = new TextEncoder().encode(payload);
    const hashArray = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", hashBytes)));
    const signature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    const scope = data.trainer_id ?? data.department_id;
    const path = `_library/${scope}-${signature}-${Date.now()}.zip`;
    const { data: signed, error: uploadError } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (uploadError || !signed) throw new Error("Failed to create upload URL");

    const { error: uploadToSignedError } = await supabase.storage.from("documents").uploadToSignedUrl(signed.path, signed.token, zipBlob, { contentType: "application/zip" });
    if (uploadToSignedError) throw new Error(uploadToSignedError.message);

    const { data: downloadSigned } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 60);
    const deptName = deptMap.get(data.department_id) || "department";
    const filename = `library-${deptName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.zip`;
    return { url: downloadSigned?.signedUrl ?? null, doc_count: ok, filename };
  });

// ============================================================
// Approved bundle zip build (server-side)
// ============================================================

export const buildApprovedBundleZip = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({
    department_id: z.string().uuid().nullable().optional(),
    signature: z.string().min(8).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertBundleRole(supabase, userId);
    const departmentId = data.department_id ?? null;

    let q = supabase
      .from("documents")
      .select("id, title, file_path, file_name, document_type, academic_year, department_id, trainer_id")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (departmentId) q = q.eq("department_id", departmentId);
    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    if (!docs?.length) throw new Error("No approved documents to download");

    const trainerIds = Array.from(new Set(docs.map((d: any) => d.trainer_id).filter(Boolean)));
    const deptIds = Array.from(new Set(docs.map((d: any) => d.department_id).filter(Boolean)));
    const [{ data: trainers }, { data: depts }] = await Promise.all([
      trainerIds.length ? supabase.from("profiles").select("id, full_name").in("id", trainerIds) : Promise.resolve({ data: [] as any[] }),
      deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const trainerMap = new Map((trainers ?? []).map((t: any) => [t.id, t.full_name || t.email || "Unknown"]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    const zip = new JSZip({ compression: "STORE" });
    const CONCURRENCY = 12;
    let ok = 0;
    let failed = 0;

    for (let i = 0; i < docs.length; i += CONCURRENCY) {
      const batch = docs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (d: any) => {
        try {
          const { data: fileBlob, error: downloadError } = await supabase.storage.from("documents").download(d.file_path);
          if (downloadError || !fileBlob) { failed++; return; }

          const deptName = d.department_id ? (deptMap.get(d.department_id) || "Unassigned") : "Unassigned";
          const typeLabel = DOC_TYPE_LABELS[d.document_type as DocumentType] || "Documents";
          const baseName = (d.file_name || `${d.title}.bin`).replace(/[\/\\?%*:|"<>]/g, "_");
          zip.folder(deptName)!.folder(typeLabel)!.file(baseName, fileBlob);
          ok++;
        } catch (err) {
          console.error("[bundle-zip] failed", d.id, err);
          failed++;
        }
      }));
    }

    if (!ok) throw new Error("Could not package any files");

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const path = `_bundles/${data.department_id ?? "all"}-${data.signature}-${Date.now()}.zip`;
    const { data: signed, error: uploadError } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (uploadError || !signed) throw new Error("Failed to create upload URL");

    const { error: uploadToSignedError } = await supabase.storage.from("documents").uploadToSignedUrl(signed.path, signed.token, zipBlob, { contentType: "application/zip" });
    if (uploadToSignedError) throw new Error(uploadToSignedError.message);

    let staleQ = supabase.from("bundle_cache").select("id, storage_path").neq("signature", data.signature);
    staleQ = departmentId ? staleQ.eq("department_id", departmentId) : staleQ.is("department_id", null);
    const { data: stale } = await staleQ;
    if (stale?.length) {
      const paths = stale.map((r: any) => r.storage_path).filter(Boolean);
      if (paths.length) await supabase.storage.from("documents").remove(paths);
      await supabase.from("bundle_cache").delete().in("id", stale.map((r: any) => r.id));
    }
    let sameQ = supabase.from("bundle_cache").delete().eq("signature", data.signature);
    sameQ = departmentId ? sameQ.eq("department_id", departmentId) : sameQ.is("department_id", null);
    await sameQ;
    await supabase.from("bundle_cache").insert({
      department_id: departmentId,
      signature: data.signature,
      storage_path: path,
      doc_count: ok,
      size_bytes: zipBlob.size,
      created_by: userId,
    });

    const { data: downloadSigned } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 60);
    return { url: downloadSigned?.signedUrl ?? null, doc_count: ok, size_bytes: zipBlob.size };
  });
