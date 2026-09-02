import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListDepartments, adminUpsertDepartment, adminDeleteDepartment, adminListUsers } from "@/lib/api/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/departments")({
  head: () => ({ meta: [{ title: "Departments — WTTI SWMS" }] }),
  component: AdminDepts,
});

function AdminDepts() {
  const fetchDepts = useServerFn(adminListDepartments);
  const fetchUsers = useServerFn(adminListUsers);
  const upsert = useServerFn(adminUpsertDepartment);
  const remove = useServerFn(adminDeleteDepartment);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-depts"], queryFn: () => fetchDepts() });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const hodCandidates = (users.data ?? []).filter((u: any) => u.roles.includes("hod"));
  const userMap = new Map((users.data ?? []).map((u: any) => [u.id, u.full_name || u.email]));

  async function save(form: { name: string; hod_id: string | null }) {
    await upsert({ data: editing ? { id: editing.id, ...form } : form });
    toast.success("Saved");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-depts"] });
  }

  async function del(id: string) {
    if (!confirm("Delete this department?")) return;
    await remove({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-depts"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Departments</h1>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New department</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {(q.data ?? []).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">HOD: {d.hod_id ? userMap.get(d.hod_id) ?? "—" : "Unassigned"}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(d); setOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => del(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {(q.data ?? []).length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No departments yet.</div>}
          </div>
        </CardContent>
      </Card>
      {open && <EditDept dept={editing} hodCandidates={hodCandidates} onClose={() => { setOpen(false); setEditing(null); }} onSave={save} />}
    </div>
  );
}

function EditDept({ dept, hodCandidates, onClose, onSave }: any) {
  const [name, setName] = useState(dept?.name || "");
  const [hodId, setHodId] = useState<string>(dept?.hod_id || "");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dept ? "Edit" : "New"} department</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Head of Department</Label>
            <Select value={hodId || "none"} onValueChange={(v) => setHodId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {hodCandidates.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Only users with the HOD role can be assigned. Assign roles in User Management.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ name, hod_id: hodId || null })} disabled={!name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
