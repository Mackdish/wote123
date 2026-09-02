import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/api/auth.functions";
import {
  listReportPermissions, setReportPermission,
  listLibraryPermissions, setLibraryPermission,
  listDocumentTypeSettings, updateDocumentTypeSetting,
} from "@/lib/api/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, DOC_TYPE_LABELS, type AppRole, type DocumentType } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Access & Document Types — WTTI SWMS" },
      { name: "description", content: "Control which roles can view reports and which document types are available." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isAdmin = me.data?.roles.includes("admin");

  const fetchPerms = useServerFn(listReportPermissions);
  const savePerm = useServerFn(setReportPermission);
  const fetchLibraryPerms = useServerFn(listLibraryPermissions);
  const saveLibraryPerm = useServerFn(setLibraryPermission);
  const fetchTypes = useServerFn(listDocumentTypeSettings);
  const saveType = useServerFn(updateDocumentTypeSetting);
  const qc = useQueryClient();

  const perms = useQuery({ queryKey: ["report-permissions"], queryFn: () => fetchPerms(), enabled: !!isAdmin });
  const libraryPerms = useQuery({ queryKey: ["library-permissions"], queryFn: () => fetchLibraryPerms(), enabled: !!isAdmin });
  const types = useQuery({ queryKey: ["doc-type-settings"], queryFn: () => fetchTypes(), enabled: !!isAdmin });

  if (me.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Administrators only.</div>;

  async function togglePerm(role: AppRole, value: boolean) {
    try {
      await savePerm({ data: { role, can_view_reports: value } });
      qc.invalidateQueries({ queryKey: ["report-permissions"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Reports ${value ? "enabled" : "hidden"} for ${ROLE_LABELS[role]}`);
    } catch (e: any) { toast.error(e.message ?? "Could not update"); }
  }

  async function toggleLibraryPerm(role: AppRole, value: boolean) {
    try {
      await saveLibraryPerm({ data: { role, can_view_library: value } });
      qc.invalidateQueries({ queryKey: ["library-permissions"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Document Library ${value ? "enabled" : "hidden"} for ${ROLE_LABELS[role]}`);
    } catch (e: any) { toast.error(e.message ?? "Could not update"); }
  }

  async function patchType(document_type: DocumentType, patch: { label?: string; active?: boolean }) {
    try {
      await saveType({ data: { document_type, ...patch } });
      qc.invalidateQueries({ queryKey: ["doc-type-settings"] });
    } catch (e: any) { toast.error(e.message ?? "Could not update"); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Access & document types</h1>
        <p className="text-sm text-muted-foreground">Decide who can see reports and the Document Library, and manage the list of document types trainers can submit.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Report access by role</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {(perms.data ?? []).map((p) => (
            <div key={p.role} className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-medium">{ROLE_LABELS[p.role]}</div>
              <Switch
                checked={p.can_view_reports}
                disabled={p.role === "admin"}
                onCheckedChange={(v) => togglePerm(p.role, v)}
              />
            </div>
          ))}
          {(perms.data ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No roles configured.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document Library access by role</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          <p className="px-4 pb-2 pt-3 text-xs text-muted-foreground">
            Controls who can browse the Department → Trainer → Document type folder view. Off by default for HOD, IQA and Trainer.
          </p>
          {(libraryPerms.data ?? []).map((p) => (
            <div key={p.role} className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-medium">{ROLE_LABELS[p.role]}</div>
              <Switch
                checked={p.can_view_library}
                disabled={p.role === "admin"}
                onCheckedChange={(v) => toggleLibraryPerm(p.role, v)}
              />
            </div>
          ))}
          {(libraryPerms.data ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No roles configured.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Document types</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {(types.data ?? []).map((t: any) => (
            <div key={t.document_type} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {DOC_TYPE_LABELS[t.document_type as DocumentType]}
                </div>
                <Input
                  className="mt-1 max-w-sm"
                  defaultValue={t.label ?? DOC_TYPE_LABELS[t.document_type as DocumentType]}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== (t.label ?? "")) patchType(t.document_type, { label: v });
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t.active ? "Available" : "Hidden"}</span>
                <Switch checked={t.active} onCheckedChange={(v) => patchType(t.document_type, { active: v })} />
              </div>
            </div>
          ))}
          {(types.data ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No document types configured.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
