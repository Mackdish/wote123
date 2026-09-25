import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { getDashboardStats, listDocuments, getApprovedBundle, getBundleCache, createBundleUploadUrl, finalizeBundleCache } from "@/lib/api/documents.functions";
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
import JSZip from "jszip";
import { buildStampedPdf } from "@/lib/stamped-pdf";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  const fetchDepts = useServerFn(listDepartments);
  const fetchBundle = useServerFn(getApprovedBundle);
  const fetchBundleCache = useServerFn(getBundleCache);
  const createBundleUpload = useServerFn(createBundleUploadUrl);
  const finalizeBundle = useServerFn(finalizeBundleCache);
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepts() });
  const [zipping, setZipping] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const filteredDocs = useMemo(
    () => deptFilter === "all" ? docs : docs.filter((d: any) => d.department_id === deptFilter),
    [docs, deptFilter],
  );

  function triggerBrowserDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function bundleFilename() {
    const deptSlug = deptFilter === "all"
      ? "all-departments"
      : ((depts.data ?? []).find((d: any) => d.id === deptFilter)?.name ?? "department")
          .toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `approved-${deptSlug}-${new Date().toISOString().slice(0, 10)}.zip`;
  }

  async function downloadZip() {
    if (zipping || filteredDocs.length === 0) return;
    setZipping(true);
    try {
      // Ask the server for the current bundle signature. We intentionally use
      // a browser cache for stamped archives because the old server cache may
      // contain pre-stamping ZIPs generated by the previous implementation.
      const cacheInfo = await fetchBundleCache({ data: deptFilter === "all" ? {} : { department_id: deptFilter } });
      const browserCacheKey = `https://wtti.local/cache/approved-stamped-v2/${cacheInfo.signature}`;
      // Only reuse archives uploaded by this stamped pipeline. Older server-side
      // ZIPs may contain unstamped originals and must not be served here.
      if (cacheInfo.cached?.stamped && cacheInfo.cached.url) {
        const downloadUrl = new URL(cacheInfo.cached.url);
        downloadUrl.searchParams.set("download", bundleFilename());
        triggerBrowserDownload(downloadUrl.toString(), bundleFilename());
        toast.success(`Downloaded cached stamped archive (${cacheInfo.cached.doc_count} documents)`);
        return;
      }
      if ("caches" in window) {
        const cache = await caches.open("wtti-approved-stamped-v2");
        const cached = await cache.match(browserCacheKey);
        if (cached) {
          const cachedBlob = await cached.blob();
          const localUrl = URL.createObjectURL(cachedBlob);
          triggerBrowserDownload(localUrl, bundleFilename());
          setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
          toast.success(`Downloaded cached stamped archive (${cacheInfo.doc_count} documents)`);
          return;
        }
      }

      const items = await fetchBundle({ data: deptFilter === "all" ? {} : { department_id: deptFilter } });
      if (!items?.length) throw new Error("No approved documents are available for this download.");

      const zip = new JSZip();
      let added = 0;

      const STAMP_CONCURRENCY = 2;
      const stampQueue = [...(items as any[])];
      async function processItem(item: any) {
        const originalName = item.file_name || `${item.title || "document"}.bin`;
        const lowerName = originalName.toLowerCase();
        const canStamp = lowerName.endsWith(".pdf") || lowerName.endsWith(".docx") || lowerName.endsWith(".docm");
        const stamps = (item.stamps ?? []).filter((s: any) => s.role === "hod" || s.role === "iqa");
        const hasHod = stamps.some((s: any) => s.role === "hod");
        const hasIqa = stamps.some((s: any) => s.role === "iqa");

        if (canStamp) {
          if (!hasHod || !hasIqa) {
            throw new Error(`"${originalName}" is approved but is missing HOD/IQA approval stamp data.`);
          }
          const stamped = await buildStampedPdf({
            title: item.title,
            meta: {
              "Academic Year": item.academic_year || "—",
              Term: item.term || "—",
              Status: "approved",
              Department: item.department_name || "—",
            },
            fileUrl: item.url,
            fileName: originalName,
            stamps,
          });
          const stampedName = originalName.replace(/\.[^.]+$/, "") + "_stamped.pdf";
          zip.folder(item.department_name || "Unassigned")!
            .folder(DOC_TYPE_LABELS[item.document_type as DocumentType] || "Documents")!
            .file(stampedName, stamped);
        } else {
          // Unsupported source formats cannot be stamped safely; keep the original.
          const res = await fetch(item.url, { cache: "no-store" });
          if (!res.ok) throw new Error(`Download failed for "${originalName}": ${res.status}`);
          zip.folder(item.department_name || "Unassigned")!
            .folder(DOC_TYPE_LABELS[item.document_type as DocumentType] || "Documents")!
            .file(originalName, await res.arrayBuffer());
        }
        return originalName;
      }

      // Render a few documents at once instead of processing the entire archive
      // serially. This substantially reduces wait time while avoiding excessive
      // browser memory use from rendering many DOCX files simultaneously.
      while (stampQueue.length) {
        const batch = stampQueue.splice(0, STAMP_CONCURRENCY);
        try {
          await Promise.all(batch.map(processItem));
          added += batch.length;
        } catch (error: any) {
          const message = error?.message ?? String(error);
          throw new Error(
            `The approved archive could not be completed. ${message}. Try downloading the affected document individually to identify the source file.`
          );
        }
      }

      if (!added) throw new Error("No documents could be prepared for download.");
      const blob = await zip.generateAsync({ type: "blob" });

      // Persist the finished stamped ZIP locally. Subsequent downloads with the
      // same approved-document/approval signature are immediate and do not
      // re-render DOCX files or rebuild the ZIP.
      if ("caches" in window) {
        try {
          const cache = await caches.open("wtti-approved-stamped-v2");
          await cache.put(
            browserCacheKey,
            new Response(blob, {
              headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" },
            }),
          );
        } catch (cacheError) {
          console.warn("[approved-archive] browser cache unavailable", cacheError);
        }
      }

      // Store the completed stamped archive in Supabase so later downloads can
      // go straight to a signed Storage URL instead of rebuilding the ZIP.
      let remoteDownloadUrl: string | null = null;
      try {
        const upload = await createBundleUpload({
          data: {
            ...(deptFilter === "all" ? {} : { department_id: deptFilter }),
            signature: cacheInfo.signature,
          },
        });
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .uploadToSignedUrl(upload.path, upload.token, blob, { contentType: "application/zip" });
        if (uploadError) throw uploadError;
        const finalized = await finalizeBundle({
          data: {
            ...(deptFilter === "all" ? {} : { department_id: deptFilter }),
            signature: cacheInfo.signature,
            storage_path: upload.path,
            doc_count: added,
            size_bytes: blob.size,
          },
        });
        remoteDownloadUrl = finalized.url;
      } catch (cacheError) {
        console.warn("[approved-archive] remote stamped cache unavailable", cacheError);
      }

      if (remoteDownloadUrl) {
        const downloadUrl = new URL(remoteDownloadUrl);
        downloadUrl.searchParams.set("download", bundleFilename());
        triggerBrowserDownload(downloadUrl.toString(), bundleFilename());
      } else {
        const localUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(localUrl, bundleFilename());
        setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
      }
      toast.success(`Downloaded ${added} approved document${added === 1 ? "" : "s"} with approval stamps`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to build stamped archive");
    } finally {
      setZipping(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">Approved & Final Documents</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            View-only archive — filter by department, download all as a zipped folder. Approved PDF/DOCX/DOCM files are stamped with both HOD and IQA approvals.
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
            {zipping ? `Preparing… (${filteredDocs.length})` : `Download ZIP (${filteredDocs.length})`}
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

