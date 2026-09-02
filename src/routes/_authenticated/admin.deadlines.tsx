import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listDeadlines, upsertDeadline, deleteDeadline } from "@/lib/api/settings.functions";
import { adminListDepartments } from "@/lib/api/admin.functions";
import { getMe } from "@/lib/api/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOC_TYPE_LABELS, type DocumentType } from "@/lib/types";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/deadlines")({
  head: () => ({
    meta: [
      { title: "Submission Deadlines — WTTI SWMS" },
      { name: "description", content: "Set document submission deadlines per document type and department." },
    ],
  }),
  component: DeadlinesPage,
});

const ALL_DEPTS = "__all__";

function DeadlinesPage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const fetchList = useServerFn(listDeadlines);
  const fetchDepts = useServerFn(adminListDepartments);
  const save = useServerFn(upsertDeadline);
  const del = useServerFn(deleteDeadline);
  const qc = useQueryClient();

  const isAdmin = me.data?.roles.includes("admin");
  const list = useQuery({ queryKey: ["deadlines"], queryFn: () => fetchList(), enabled: !!isAdmin });
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepts(), enabled: !!isAdmin });

  const [type, setType] = useState<DocumentType>("scheme_of_work");
  const [dept, setDept] = useState<string>(ALL_DEPTS);
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (me.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Administrators only.</div>;

  async function add() {
    if (!due) { toast.error("Pick a due date"); return; }
    setBusy(true);
    try {
      await save({ data: {
        document_type: type,
        department_id: dept === ALL_DEPTS ? null : dept,
        academic_year: year || null,
        term: term || null,
        due_date: due,
        allow_late: true,
        notes: notes || null,
      } });
      toast.success("Deadline saved");
      setDue(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    } catch (e: any) { toast.error(e.message ?? "Could not save"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    } catch (e: any) { toast.error(e.message ?? "Could not delete"); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Submission deadlines</h1>
        <p className="text-sm text-muted-foreground">Set a due date per document type and department. Submissions after the date are flagged as late.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Add / update a deadline</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Document type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((t) => (
                  <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPTS}>All departments</SelectItem>
                {(depts.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <Label>Academic year (optional)</Label>
            <Input placeholder="2025/2026" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <Label>Term (optional)</Label>
            <Input placeholder="Term 1" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={add} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Save deadline
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current deadlines</CardTitle></CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div> :
            (list.data ?? []).length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No deadlines set yet.</div> :
            <div className="divide-y">
              {(list.data ?? []).map((d: any) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{DOC_TYPE_LABELS[d.document_type as DocumentType]}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.department_name ?? "All departments"}
                      {d.academic_year ? ` · ${d.academic_year}` : ""}{d.term ? ` · ${d.term}` : ""}
                      {d.notes ? ` · ${d.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                      Due {new Date(d.due_date).toLocaleDateString()}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => remove(d.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
