import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminListUsers,
  adminUpdateUser,
  adminDeleteUser,
  adminRestoreUser,
  USER_RESTORE_WINDOW_DAYS,
  listDepartments,
} from "@/lib/api/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS, type AppRole } from "@/lib/types";
import { toast } from "sonner";
import { Trash2, Undo2, UserCog } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users — WTTI SWMS" }] }),
  component: AdminUsers,
});

const ALL_ROLES: AppRole[] = ["admin", "trainer", "hod", "deputy_principal", "iqa"];

function AdminUsers() {
  const fetchUsers = useServerFn(adminListUsers);
  const fetchDepts = useServerFn(listDepartments);
  const update = useServerFn(adminUpdateUser);
  const remove = useServerFn(adminDeleteUser);
  const restore = useServerFn(adminRestoreUser);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepts() });
  const [editing, setEditing] = useState<any | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  async function handleDelete(user: any) {
    if (!confirm(`Delete ${user.full_name || user.email}?\n\nThe account will be deactivated and can be restored within ${USER_RESTORE_WINDOW_DAYS} days. After that it cannot be recovered.`)) return;
    setBusyId(user.id);
    try {
      await remove({ data: { user_id: user.id } });
      toast.success(`User deleted — restorable for ${USER_RESTORE_WINDOW_DAYS} days`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete user");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(user: any) {
    setBusyId(user.id);
    try {
      await restore({ data: { user_id: user.id } });
      toast.success("User restored");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to restore user");
    } finally {
      setBusyId(null);
    }
  }

  async function save(form: { full_name: string; department_id: string | null; status: boolean; roles: AppRole[] }) {
    await update({ data: { user_id: editing.id, ...form } });
    toast.success("Roles updated");
    setEditing(null);
    await qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button variant={showDeleted ? "default" : "outline"} size="sm" onClick={() => setShowDeleted((v) => !v)}>
          {showDeleted ? "Showing deleted" : "Show deleted"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Staff register themselves on the login page. Every new account starts as a Trainer — assign the correct roles and department here.
      </p>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : q.isError ? (
            <div className="p-8 text-center text-sm text-destructive">{(q.error as Error)?.message ?? "Could not load users."}</div>
          ) : (() => {
            const all = q.data ?? [];
            const list = all.filter((u: any) => (showDeleted ? !!u.deleted_at : !u.deleted_at));
            if (list.length === 0) {
              return <div className="p-8 text-center text-sm text-muted-foreground">{showDeleted ? "No deleted users." : "No users have registered yet."}</div>;
            }
            return (
              <div className="divide-y">
                {list.map((u: any) => {
                  const isDeleted = !!u.deleted_at;
                  const daysLeft = u.restore_until ? Math.max(0, Math.ceil((new Date(u.restore_until).getTime() - Date.now()) / 86_400_000)) : 0;
                  const displayRoles: AppRole[] = isDeleted ? ((u.deleted_roles as AppRole[] | null) ?? []) : u.roles;
                  return (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-medium">{u.full_name || u.email}</div>
                        <div className="text-xs text-muted-foreground">{u.email} · {u.department_name ?? "No department"}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {displayRoles.map((r: AppRole) => <span key={r} className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">{ROLE_LABELS[r]}</span>)}
                          {!isDeleted && displayRoles.length === 0 && (
                            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] text-warning-foreground">Awaiting role assignment</span>
                          )}
                          {isDeleted ? (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                              Deleted · {daysLeft > 0 ? `${daysLeft}d left to restore` : "recovery window expired"}
                            </span>
                          ) : !u.status && (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">Inactive</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {isDeleted ? (
                          <Button size="sm" variant="outline" onClick={() => handleRestore(u)} disabled={busyId === u.id || daysLeft <= 0}>
                            <Undo2 className="mr-1 h-4 w-4" />Restore
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                              <UserCog className="mr-1 h-4 w-4" />Assign roles
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => handleDelete(u)} disabled={busyId === u.id}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {editing && <EditDialog user={editing} depts={depts.data ?? []} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}


function EditDialog({ user, depts, onClose, onSave }: any) {
  const [fullName, setFullName] = useState(user.full_name || "");
  const [deptId, setDeptId] = useState<string>(user.department_id || "");
  const [status, setStatus] = useState(user.status);
  const [roles, setRoles] = useState<AppRole[]>(user.roles);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign roles & department</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={deptId || "none"} onValueChange={(v) => setDeptId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={(c) => setRoles((rs) => c ? [...rs, r] : rs.filter((x) => x !== r))} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={status} onCheckedChange={(c) => setStatus(!!c)} /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ full_name: fullName, department_id: deptId || null, status, roles })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
