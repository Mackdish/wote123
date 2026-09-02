import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { submitDocument } from "@/lib/api/documents.functions";
import { listDepartments } from "@/lib/api/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOC_TYPE_LABELS, type DocumentType } from "@/lib/types";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents/new")({
  validateSearch: z.object({ parent: z.string().uuid().optional() }).partial(),
  head: () => ({ meta: [{ title: "Submit document — WTTI SWMS" }] }),
  component: SubmitPage,
});

function SubmitPage() {
  const navigate = useNavigate();
  const { parent } = useSearch({ from: "/_authenticated/documents/new" });
  const submit = useServerFn(submitDocument);
  const fetchDepts = useServerFn(listDepartments);
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepts() });

  const [form, setForm] = useState({
    title: "", description: "", document_type: "scheme_of_work" as DocumentType,
    subject: "", course: "", class_name: "", academic_year: "", term: "", week: "", session: "",
    department_id: "" as string,
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Please attach a file");
    if (file.size > 20 * 1024 * 1024) return toast.error("File must be under 20 MB");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() || "bin";
      const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const res = await submit({
        data: {
          title: form.title, description: form.description || null, document_type: form.document_type,
          subject: form.subject || null, course: form.course || null,
          class_name: form.class_name || null, academic_year: form.academic_year || null,
          term: form.term || null, week: form.week || null, session: form.session || null,
          file_path: path, file_name: file.name, mime_type: file.type,
          department_id: form.department_id || null,
          parent_document_id: parent ?? null,
        },
      });
      toast.success(parent ? "New version submitted for review" : "Document submitted for review");
      navigate({ to: "/documents/$id", params: { id: res.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit");
    } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{parent ? "Upload new version" : "Submit document"}</h1>
        <p className="text-sm text-muted-foreground">
          {parent
            ? "Uploading a revised version. Once approved, it will become the current version and older ones will be archived."
            : "Upload a Scheme of Work, Session Plan, Record of Work, Learning Plan, Lesson Notes, Assessment or other institutional document for review."}
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Document details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handle} className="grid gap-4 md:grid-cols-2">
            <Field label="Title *" className="md:col-span-2">
              <Input value={form.title} onChange={(e) => set("title")(e.target.value)} required maxLength={200} />
            </Field>
            <Field label="Document type *">
              <Select value={form.document_type} onValueChange={(v) => set("document_type")(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select value={form.department_id} onValueChange={(v) => set("department_id")(v)}>
                <SelectTrigger><SelectValue placeholder="Use my default department" /></SelectTrigger>
                <SelectContent>
                  {(depts.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Required if your account has no default department. Determines which HOD reviews your submission.</p>
            </Field>
            <Field label="Unit"><Input value={form.subject} onChange={(e) => set("subject")(e.target.value)} placeholder="e.g. Unit 3 — Engine Systems" /></Field>
            <Field label="Course"><Input value={form.course} onChange={(e) => set("course")(e.target.value)} placeholder="e.g. Diploma in Automotive Engineering" /></Field>
            <Field label="Class"><Input value={form.class_name} onChange={(e) => set("class_name")(e.target.value)} placeholder="e.g. Diploma Y2" /></Field>
            <Field label="Academic Year"><Input value={form.academic_year} onChange={(e) => set("academic_year")(e.target.value)} placeholder="2025/2026" /></Field>
            <Field label="Term"><Input value={form.term} onChange={(e) => set("term")(e.target.value)} placeholder="Term 1" /></Field>
            <Field label="Week"><Input value={form.week} onChange={(e) => set("week")(e.target.value)} placeholder="3" /></Field>
            <Field label="Session"><Input value={form.session} onChange={(e) => set("session")(e.target.value)} placeholder="Morning" /></Field>
            <Field label="Description" className="md:col-span-2">
              <Textarea value={form.description} onChange={(e) => set("description")(e.target.value)} rows={3} maxLength={2000} />
            </Field>
            <Field label="File * (PDF, DOCX, XLSX — max 20 MB)" className="md:col-span-2">
              <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </Field>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/documents" })}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Submit for review
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
