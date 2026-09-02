import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listNotices, createNotice, updateNotice, deleteNotice } from "@/lib/api/notices.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  head: () => ({ meta: [{ title: "Notices — WTTI SWMS" }] }),
  component: AdminNotices,
});

function AdminNotices() {
  const fetchList = useServerFn(listNotices);
  const create = useServerFn(createNotice);
  const update = useServerFn(updateNotice);
  const remove = useServerFn(deleteNotice);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notices"], queryFn: () => fetchList() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  async function save(form: { title: string; body: string; audience: "trainers" | "all" }) {
    try {
      if (editing) await update({ data: { id: editing.id, ...form } });
      else await create({ data: form });
      toast.success(editing ? "Notice updated" : "Notice posted");
      setOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["notices"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed to save notice"); }
  }

  async function del(id: string) {
    if (!confirm("Delete this notice?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Notice deleted");
      qc.invalidateQueries({ queryKey: ["notices"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notices</h1>
          <p className="text-sm text-muted-foreground">Post announcements visible to trainers.</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />New notice
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {(q.data ?? []).length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Megaphone className="mx-auto mb-2 h-6 w-6 opacity-60" />
              No notices posted yet.
            </div>
          ) : (
            <div className="divide-y">
              {(q.data ?? []).map((n: any) => (
                <div key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{n.title}</div>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                        {n.audience === "all" ? "All users" : "Trainers"}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      By {n.author_name ?? "Admin"} · {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(n); setOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => del(n.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {open && <EditNotice notice={editing} onClose={() => { setOpen(false); setEditing(null); }} onSave={save} />}
    </div>
  );
}

function EditNotice({ notice, onClose, onSave }: any) {
  const [title, setTitle] = useState(notice?.title || "");
  const [body, setBody] = useState(notice?.body || "");
  const [audience, setAudience] = useState<"trainers" | "all">(notice?.audience || "trainers");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{notice ? "Edit notice" : "New notice"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
          <div className="space-y-2"><Label>Message</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} /></div>
          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trainers">Trainers</SelectItem>
                <SelectItem value="all">All users</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ title: title.trim(), body: body.trim(), audience })} disabled={!title.trim() || !body.trim()}>
            {notice ? "Save" : "Post notice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
