import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";
import type { AppRole, DocumentStatus } from "@/lib/types";

const schema = z.object({
  description: z.string().trim().max(2000).optional().nullable(),
  document_type: z.enum(["scheme_of_work", "session_plan", "record_of_work", "training_program", "learning_plan", "lesson_notes", "assessment_document", "iqa_document", "course_outline", "other"]),
  subject: z.string().trim().max(200).optional().nullable(),
  course: z.string().trim().max(200).optional().nullable(),
  class_name: z.string().trim().max(100).optional().nullable(),
  week: z.string().trim().max(20).optional().nullable(),
  session: z.string().trim().max(50).optional().nullable(),
  file_path: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  parent_document_id: z.string().uuid().optional().nullable(),
});

async function usersWithRole(supabase: any, role: AppRole, departmentId: string | null): Promise<string[]> {
  const { data } = await supabase.rpc("users_with_role_in_department", { _role: role, _department_id: departmentId });
  return (data ?? []).map((r: any) => typeof r === "string" ? r : r.users_with_role_in_department).filter(Boolean);
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200) || "Uploaded document";
}

export const submitDocumentForCurrentPeriod = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: period }] = await Promise.all([
      supabase.from("profiles").select("department_id, full_name").eq("id", userId).maybeSingle(),
      supabase.from("academic_period_settings").select("academic_year, term").eq("id", 1).maybeSingle(),
    ]);
    if (!period?.academic_year || !period?.term) throw new Error("The administrator has not configured the current academic year and term.");

    let deptId = profile?.department_id || data.department_id || null;
    if (data.parent_document_id) {
      const { data: parent } = await supabase.from("documents").select("department_id, trainer_id").eq("id", data.parent_document_id).maybeSingle();
      if (!parent) throw new Error("Parent document not found or not accessible");
      if (parent.trainer_id !== userId) throw new Error("Only the original trainer can upload a new version");
      deptId = parent.department_id ?? deptId;
    }
    if (!deptId) throw new Error("Your account has no department assigned. Ask an administrator to set your department.");

    const title = titleFromFileName(data.file_name);
    const { data: doc, error } = await supabase.from("documents").insert({
      title,
      description: data.description || null,
      document_type: data.document_type,
      subject: data.subject || null,
      course: data.course || null,
      class_name: data.class_name || null,
      academic_year: period.academic_year,
      term: period.term,
      week: data.week || null,
      session: data.session || null,
      file_path: data.file_path,
      file_name: data.file_name,
      mime_type: data.mime_type || null,
      department_id: deptId,
      parent_document_id: data.parent_document_id || null,
      trainer_id: userId,
      status: "pending_hod" as DocumentStatus,
    }).select().single();
    if (error) throw new Error(error.message);

    await supabase.from("approval_history").insert({ document_id: doc.id, approver_id: userId, role: "trainer", action: "submitted", comment: `Submitted by ${profile?.full_name ?? "trainer"}` });
    const hodIds = new Set<string>(await usersWithRole(supabase, "hod", deptId));
    const { data: deptRow } = await supabase.from("departments").select("hod_id").eq("id", deptId).maybeSingle();
    if (deptRow?.hod_id) hodIds.add(deptRow.hod_id);
    await supabase.rpc("notify_users", { _user_ids: Array.from(hodIds), _title: "New submission for review", _message: `"${doc.title}" is awaiting your review.`, _link: `/documents/${doc.id}` });
    return { id: doc.id, academic_year: period.academic_year, term: period.term };
  });
