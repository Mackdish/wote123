import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import JSZip from "jszip";
import { getDashboardStats, listDocuments, getApprovedBundle, getBundleCache, createBundleUploadUrl, finalizeBundleCache } from "@/lib/api/documents.functions";
import { supabase } from "@/integrations/supabase/client";
import { listDepartments } from "@/lib/api/admin.functions";
import { listNotices } from "@/lib/api/notices.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMe } from "@/lib/api/auth.functions";
import { adminExists, claimFirstAdmin } from "@/lib/api/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DOC_TYPE_LABELS, STATUS_LABELS, ROLE_LABELS, type DocumentStatus, type DocumentType, type AppRole } from "@/lib/types";
import { FileText, CheckCircle2, Clock, XCircle, Upload, Users, Building2, ScrollText, ShieldCheck, GraduationCap, Crown, Loader2, Download, Megaphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — WTTI SWMS" }] }),
  component: Dashboard,
});

function Dashboard() {
  const fetchStats = useServerFn(getDashboardStats);
  const fetchDocs = useServerFn(listDocuments);
  const fetchMe = useServerFn(getMe);
  const fetchAdminExists = useServerFn(adminExists);
  const claim = useServerFn(claimFirstAdmin);
  const qc = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => fetchStats() });
  const docs = useQuery({ queryKey: ["documents"], queryFn: () => fetchDocs() });
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const adminQ = useQuery({ queryKey: ["admin-exists"], queryFn: () => fetchAdminExists() });

  const roles: AppRole[] = me.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isHod = roles.includes("hod");
  const isIqa = roles.includes("iqa");
  const isDp = roles.includes("deputy_principal");
  const isTrainer = roles.includes("trainer");

  const counts = stats.data?.counts ?? {};
  const pending = (counts["pending_hod"] ?? 0) + (counts["pending_iqa"] ?? 0) + (counts["pending_dp"] ?? 0);
  const rejected = (counts["rejected_hod"] ?? 0) + (counts["rejected_iqa"] ?? 0) + (counts["rejected_dp"] ?? 0);

  const allDocs = docs.data ?? [];
  const recent = allDocs.slice(0, 8);

  // Per-role actionable queues
  const myDeptId = me.data?.department?.id ?? null;
  const hodQueue = isHod ? allDocs.filter((d: any) => d.status === "pending_hod" && d.department_id === myDeptId) : [];
  const iqaQueue = isIqa ? allDocs.filter((d: any) => d.status === "pending_iqa" && d.department_id === myDeptId) : [];
  const approvedDocs = allDocs.filter((d: any) => d.status === "approved");
  const myDocs = isTrainer ? allDocs.filter((d: any) => d.trainer_id === me.data?.userId) : [];

  // Primary role label
  const primaryRole: AppRole | null = isAdmin ? "admin" : isDp ? "deputy_principal" : isIqa ? "iqa" : isHod ? "hod" : isTrainer ? "trainer" : null;
  const RoleIcon = isAdmin ? Crown : isDp ? ShieldCheck : isIqa ? CheckCircle2 : isHod ? Users : GraduationCap;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <RoleIcon className="h-3.5 w-3.5" />
            {primaryRole ? ROLE_LABELS[primaryRole] : "Member"}
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome{me.data?.profile?.full_name ? `, ${me.data.profile.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">Overview of academic document workflow</p>
        </div>
        {isTrainer && (
          <Button asChild><Link to="/documents/new"><Upload className="mr-2 h-4 w-4" />Submit document</Link></Button>
        )}
      </div>

      {/* Bootstrap: no admin exists yet → let the current user claim it */}
      {adminQ.data && !adminQ.data.exists && !isAdmin && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Crown className="h-4 w-4 text-warning-foreground" /> No administrator configured
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                The system has no admin yet. Claim the first admin role to manage users, departments, and assign HOD / IQA / Deputy Principal roles.
              </p>
            </div>
            <Button
              disabled={claiming}
              onClick={async () => {
                setClaiming(true);
                try {
                  await claim();
                  toast.success("You are now the administrator");
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: ["me"] }),
                    qc.invalidateQueries({ queryKey: ["admin-exists"] }),
                  ]);
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to claim admin");
                } finally {
                  setClaiming(false);
                }
              }}
            >
              {claiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
              Claim admin access
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={FileText} label="Total documents" value={stats.data?.total ?? 0} tone="primary" />
        <StatCard icon={Clock} label="Pending review" value={pending} tone="warning" />
        <StatCard icon={CheckCircle2} label="Approved" value={counts["approved"] ?? 0} tone="success" />
        <StatCard icon={XCircle} label="Rejected" value={rejected} tone="destructive" />
      </div>

      {/* Admin: full control panel */}
      {isAdmin && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /> Administrator Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminQuick to="/admin/users" icon={Users} label="User Management" desc="Roles & accounts" />
              <AdminQuick to="/admin/departments" icon={Building2} label="Departments" desc="HODs & structure" />
              <AdminQuick to="/admin/notices" icon={Megaphone} label="Notices" desc="Post announcements" />
              <AdminQuick to="/admin/audit" icon={ScrollText} label="Audit Logs" desc="Activity trail" />
            </div>
          </CardContent>
        </Card>
      )}

      <NoticesPanel visibleToTrainerOnly={!isAdmin && !isDp && !isIqa && !isHod} />


      {/* Role-specific action queues */}
      {(isHod || isIqa) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {isHod && <QueueCard title="HOD Queue — Pending your review" docs={hodQueue} emptyLabel="No submissions awaiting HOD review" />}
          {isIqa && <QueueCard title="IQA Queue — Quality assurance review" docs={iqaQueue} emptyLabel="No documents awaiting IQA" />}
        </div>
      )}

      {/* Deputy Principal: view-only archive of finally approved documents with ZIP download */}
      {(isDp || isAdmin || isHod || isIqa) && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Building2 className="h-4 w-4 text-primary" /> Departmental document library
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse documents by department, then open each trainer's folder. Filter by approval stage, type, academic year and term.
              </p>
            </div>
            <Button asChild variant="outline"><Link to="/library">Open library</Link></Button>
          </CardContent>
        </Card>
      )}

      {isDp && <ApprovedArchive docs={approvedDocs} />}
      {isAdmin && <ApprovedArchive docs={approvedDocs} />}

      {isTrainer && !isAdmin && !isHod && !isIqa && !isDp && (
        <QueueCard title="My submissions" docs={myDocs.slice(0, 8)} emptyLabel="You haven't submitted any documents yet." />
      )}

      <Card>
        <CardHeader><CardTitle>Recent documents</CardTitle></CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No documents yet.</div>
          ) : (
            <div className="divide-y">
              {recent.map((d: any) => (
                <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/20">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.document_type as DocumentType]} · {d.trainer_name} · {d.department_name ?? "—"}</div>
                  </div>
                  <StatusBadge status={d.status as DocumentStatus} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Status breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(STATUS_LABELS) as DocumentStatus[]).map((s) => (
              <div key={s} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</div>
                <div className="mt-1 text-xl font-bold">{counts[s] ?? 0}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "primary" | "warning" | "success" | "destructive" }) {
  const cls = { primary: "bg-primary-soft text-primary", warning: "bg-warning/20 text-warning-foreground", success: "bg-success/15 text-success", destructive: "bg-destructive/15 text-destructive" }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`grid h-11 w-11 place-items-center rounded-lg ${cls}`}><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminQuick({ to, icon: Icon, label, desc }: { to: string; icon: any; label: string; desc: string }) {
  return (
    <Link to={to} className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-sm">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground group-hover:text-primary">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}

function QueueCard({ title, docs, emptyLabel }: { title: string; docs: any[]; emptyLabel: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning-foreground">{docs.length}</span>
      </CardHeader>
      <CardContent className="p-0">
        {docs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="divide-y">
            {docs.slice(0, 6).map((d: any) => (
              <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/20">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.document_type as DocumentType]} · {d.trainer_name}</div>
                </div>
                <StatusBadge status={d.status as DocumentStatus} />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovedArchive({ docs }: { docs: any[] }) {
  const fetchBundle = useServerFn(getApprovedBundle);
  const fetchDepts = useServerFn(listDepartments);
  const fetchCache = useServerFn(getBundleCache);
  const createUpload = useServerFn(createBundleUploadUrl);
  const finalizeCache = useServerFn(finalizeBundleCache);
  const qc = useQueryClient();
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepts() });
  const [zipping, setZipping] = useState(false);
  const [prebuilding, setPrebuilding] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const filteredDocs = useMemo(
    () => deptFilter === "all" ? docs : docs.filter((d: any) => d.department_id === deptFilter),
    [docs, deptFilter],
  );

  const cacheArg = useMemo(
    () => (deptFilter === "all" ? {} : { department_id: deptFilter }),
    [deptFilter],
  );
  const cacheKey = ["bundle-cache", deptFilter] as const;
  const cache = useQuery({
    queryKey: cacheKey,
    queryFn: () => fetchCache({ data: cacheArg }),
    staleTime: 30_000,
  });

  const cached = cache.data?.cached ?? null;
  const signature = cache.data?.signature ?? null;
  const isFresh = !!cached && cached.doc_count === filteredDocs.length;

  async function buildAndCache(background: boolean): Promise<Blob | null> {
    if (!signature) return null;
    const items = await fetchBundle({ data: cacheArg });
    if (!items.length) {
      if (!background) toast.info("No approved documents to download");
      return null;
    }
    const { buildStampedPdf } = await import("@/lib/stamped-pdf");
    const zip = new JSZip();
    let ok = 0;
    let failed = 0;

    async function processOne(it: any) {
      try {
        const deptFolder = (it.department_name ?? "Unassigned").replace(/[\/\\?%*:|"<>]/g, "_");
        const typeFolder = DOC_TYPE_LABELS[it.document_type as DocumentType] ?? "Documents";
        const baseName = (it.file_name || `${it.title}.bin`).replace(/[\/\\?%*:|"<>]/g, "_");
        const stamps = (it.stamps ?? []) as any[];
        if (stamps.length > 0) {
          const bytes = await buildStampedPdf({
            title: it.title,
            meta: {
              Type: DOC_TYPE_LABELS[it.document_type as DocumentType],
              Department: it.department_name ?? "—",
              "Academic Year": it.academic_year ?? "—",
              Status: "approved",
            },
            fileUrl: it.url,
            fileName: it.file_name,
            stamps: stamps.map((s: any) => ({ role: s.role as "hod" | "iqa", approverName: s.approverName, date: s.date })),
          });
          const stampedName = baseName.replace(/\.[^.]+$/, "") + "_stamped.pdf";
          zip.folder(deptFolder)!.folder(typeFolder)!.file(`${it.id.slice(0, 8)}-${stampedName}`, bytes as Uint8Array);
        } else {
          const res = await fetch(it.url);
          if (!res.ok) { failed++; return; }
          const blob = await res.blob();
          zip.folder(deptFolder)!.folder(typeFolder)!.file(`${it.id.slice(0, 8)}-${baseName}`, blob);
        }
        ok++;
      } catch (err) {
        console.error("[zip] failed to stamp", it.id, err);
        failed++;
      }
    }

    const CONCURRENCY = 6;
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      await Promise.all(items.slice(i, i + CONCURRENCY).map(processOne));
    }
    if (!ok) {
      if (!background) toast.error("Could not package any files");
      return null;
    }
    const blob = await zip.generateAsync({ type: "blob" });

    // Upload to cache so future downloads are instant.
    try {
      const up = await createUpload({ data: { ...cacheArg, signature } });
      const { error: upErr } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(up.path, up.token, blob, { contentType: "application/zip" });
      if (upErr) throw upErr;
      await finalizeCache({ data: {
        ...cacheArg, signature, storage_path: up.path,
        doc_count: items.length, size_bytes: blob.size,
      } });
      qc.invalidateQueries({ queryKey: cacheKey });
    } catch (err) {
      console.warn("[bundle-cache] upload failed", err);
    }

    if (!background && failed) toast.success(`Packaged ${ok} document${ok === 1 ? "" : "s"} (${failed} skipped)`);
    return blob;
  }

  function triggerBrowserDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function bundleFilename() {
    const deptSlug = deptFilter === "all"
      ? "all-departments"
      : ((depts.data ?? []).find((d: any) => d.id === deptFilter)?.name ?? "department")
          .toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `approved-${deptSlug}-${new Date().toISOString().slice(0, 10)}.zip`;
  }

  async function downloadZip() {
    if (zipping) return;
    // Fast path: cached & up-to-date → just fetch the signed URL.
    if (cached && isFresh) {
      try {
        const res = await fetch(cached.url);
        if (!res.ok) throw new Error(`Cache fetch failed: ${res.status}`);
        const blob = await res.blob();
        const localUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(localUrl, bundleFilename());
        URL.revokeObjectURL(localUrl);
        toast.success("Downloaded prebuilt archive");
        return;
      } catch (err) {
        console.warn("[bundle-cache] cache fetch failed, rebuilding", err);
      }
    }
    setZipping(true);
    try {
      const blob = await buildAndCache(false);
      if (!blob) return;
      const localUrl = URL.createObjectURL(blob);
      triggerBrowserDownload(localUrl, bundleFilename());
      URL.revokeObjectURL(localUrl);
      toast.success("Archive ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to build archive");
    } finally { setZipping(false); }
  }

  // Background prebuild: when there are approved docs but no fresh cache, build silently.
  const [prebuiltFor, setPrebuiltFor] = useState<string | null>(null);
  useEffect(() => {
    if (cache.isLoading) return;
    if (!signature || filteredDocs.length === 0) return;
    if (isFresh) return;
    if (prebuilding || zipping) return;
    if (prebuiltFor === signature) return;
    setPrebuilding(true);
    setPrebuiltFor(signature);
    (async () => {
      try { await buildAndCache(true); } catch (err) { console.warn("[bundle-cache] prebuild failed", err); }
      finally { setPrebuilding(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isFresh, filteredDocs.length, cache.isLoading]);

  const buttonLabel = isFresh
    ? `Download cached ZIP (${filteredDocs.length})`
    : prebuilding
      ? `Preparing… (${filteredDocs.length})`
      : `Download ZIP (${filteredDocs.length})`;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">Approved & Final Documents</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            View-only archive — filter by department, download all as a zipped folder.
            {isFresh && cached && (
              <span className="ml-1 text-success">Prebuilt {new Date(cached.created_at).toLocaleString()} · {(cached.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
            )}
            {!isFresh && prebuilding && <span className="ml-1">Building cached archive in background…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(depts.data ?? []).map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={downloadZip} disabled={zipping || filteredDocs.length === 0}>
            {zipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {buttonLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredDocs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No approved documents in this view.</div>
        ) : (
          <div className="divide-y">
            {filteredDocs.slice(0, 12).map((d: any) => (
              <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/20">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{DOC_TYPE_LABELS[d.document_type as DocumentType]} · {d.trainer_name} · {d.department_name ?? "—"}</div>
                </div>
                <StatusBadge status={d.status as DocumentStatus} />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoticesPanel({ visibleToTrainerOnly: _v }: { visibleToTrainerOnly: boolean }) {
  const fetchNotices = useServerFn(listNotices);
  const q = useQuery({ queryKey: ["notices"], queryFn: () => fetchNotices() });
  const notices = (q.data ?? []).slice(0, 5);
  if (notices.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-primary" /> Notices</CardTitle>
        <span className="text-xs text-muted-foreground">{q.data?.length ?? 0} total</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {notices.map((n: any) => (
            <div key={n.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-foreground">{n.title}</div>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                  {n.audience === "all" ? "All" : "Trainers"}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                By {n.author_name ?? "Admin"} · {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

