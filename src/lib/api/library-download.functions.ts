import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";
import { DOC_TYPE_LABELS, type DocumentType } from "@/lib/types";
import JSZip from "jszip";

const schema = z.object({
  department_id: z.string().uuid(),
  trainer_id: z.string().uuid().nullable().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  year: z.string().optional(),
  term: z.string().optional(),
});

function toDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export const downloadApprovedStampedLibrary = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canView } = await supabase.rpc("can_view_library", { _user_id: userId });
    if (!canView) throw new Error("Forbidden: the Document Library is limited to the Deputy Principal and Administrators.");

    // The Library download is deliberately restricted to finally approved documents.
    // A document is considered stamped only after both HOD and IQA approvals exist.
    let q = supabase.from("documents")
      .select("id, title, file_path, file_name, document_type, trainer_id, department_id, academic_year, term")
      .eq("department_id", data.department_id)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (data.trainer_id) q = q.eq("trainer_id", data.trainer_id);
    if (data.type && data.type !== "all") q = q.eq("document_type", data.type);
    if (data.year && data.year !== "all") q = q.eq("academic_year", data.year);
    if (data.term && data.term !== "all") q = q.eq("term", data.term);
    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    if (!docs?.length) throw new Error("No stamped documents match these filters.");

    const ids = docs.map((d: any) => d.id);
    const { data: approvals } = await supabase.from("approval_history")
      .select("document_id, role, action")
      .in("document_id", ids)
      .eq("action", "approve")
      .in("role", ["hod", "iqa"]);
    const approvedRoles = new Map<string, Set<string>>();
    for (const row of approvals ?? []) {
      if (!approvedRoles.has(row.document_id)) approvedRoles.set(row.document_id, new Set());
      approvedRoles.get(row.document_id)!.add(row.role);
    }
    const stampedDocs = docs.filter((d: any) => {
      const roles = approvedRoles.get(d.id);
      return roles?.has("hod") && roles?.has("iqa");
    });
    if (!stampedDocs.length) throw new Error("No documents have completed both HOD and IQA approval stamps.");

    const trainerIds = Array.from(new Set(stampedDocs.map((d: any) => d.trainer_id).filter(Boolean)));
    const deptIds = Array.from(new Set(stampedDocs.map((d: any) => d.department_id).filter(Boolean)));
    const [{ data: trainers }, { data: depts }] = await Promise.all([
      trainerIds.length ? supabase.from("profiles").select("id, full_name").in("id", trainerIds) : Promise.resolve({ data: [] as any[] }),
      deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const trainerMap = new Map((trainers ?? []).map((t: any) => [t.id, t.full_name || "Unknown"]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    const zip = new JSZip();
    let ok = 0;
    for (const d of stampedDocs as any[]) {
      if (!d.file_path) continue;
      const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 60 * 60);
      if (signedError || !signed?.signedUrl) continue;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      const trainerName = trainerMap.get(d.trainer_id) || "Unknown";
      const deptName = d.department_id ? (deptMap.get(d.department_id) || "Unassigned") : "Unassigned";
      const typeLabel = DOC_TYPE_LABELS[d.document_type as DocumentType] || "Documents";
      const safe = (d.file_name || `${d.title}.bin`).replace(/[\\/?%*:|"<>]/g, "_");
      zip.folder(trainerName)!.folder(typeLabel)!.file(safe, buffer, { compression: "STORE" });
      ok++;
    }
    if (!ok) throw new Error("Could not package any stamped documents.");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const bytes = new Uint8Array(await zipBlob.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("This stamped Library ZIP is too large. Narrow the filters and try again.");
    const filename = `stamped-library-${(deptMap.get(data.department_id) || "department").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.zip`;
    return { url: toDataUrl(bytes, "application/zip"), doc_count: ok, filename };
  });
