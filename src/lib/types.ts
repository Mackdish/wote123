export type AppRole = "admin" | "trainer" | "hod" | "deputy_principal" | "iqa";
export type DocumentType =
  | "scheme_of_work"
  | "session_plan"
  | "record_of_work"
  | "training_program"
  | "learning_plan"
  | "lesson_notes"
  | "assessment_document"
  | "iqa_document"
  | "course_outline"
  | "other";
export type DocumentStatus =
  | "pending_hod" | "rejected_hod"
  | "pending_iqa" | "rejected_iqa"
  | "pending_dp" | "rejected_dp"
  | "approved";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  trainer: "Trainer",
  hod: "Head of Department",
  deputy_principal: "Deputy Principal",
  iqa: "Internal Quality Assurance",
};

export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  scheme_of_work: "Scheme of Work",
  session_plan: "Session Plan",
  record_of_work: "Record of Work",
  training_program: "Training Program",
  learning_plan: "Learning Plan",
  lesson_notes: "Lesson Notes",
  assessment_document: "Assessment Document",
  iqa_document: "IQA Document",
  course_outline: "Course Outline",
  other: "Other Official Document",
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending_hod: "Pending HOD Review",
  rejected_hod: "Rejected by HOD",
  pending_iqa: "Pending IQA Review",
  rejected_iqa: "Rejected by IQA",
  pending_dp: "Pending Deputy Principal",
  rejected_dp: "Rejected by Deputy Principal",
  approved: "Approved",
};

export const STATUS_TONE: Record<DocumentStatus, "warning" | "destructive" | "success" | "info"> = {
  pending_hod: "warning",
  pending_iqa: "warning",
  pending_dp: "warning",
  rejected_hod: "destructive",
  rejected_iqa: "destructive",
  rejected_dp: "destructive",
  approved: "success",
};
