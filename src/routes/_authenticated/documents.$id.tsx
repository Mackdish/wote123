import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDocument, reviewDocument, deleteDocument } from "@/lib/api/documents.functions";
import { logStampedDownload } from "@/lib/api/admin.functions";
import { getMe } from "@/lib/api/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { ApprovalStamp } from "@/components/approval-stamp";
import { buildStampedPdf } from "@/lib/stamped-pdf";
import { DOC_TYPE_LABELS, ROLE_LABELS, type DocumentStatus, type DocumentType } from "@/lib/types";
import { Download, ArrowLeft, CheckCircle2, XCircle, Loader2, FileDown, GitBranch, UploadCloud, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({ meta: [{ title: "Document — WTTI SWMS" }] }),
  component: DocPage,
});

function DocPage() {
  const { id } = useParams({ from: "/_authenticated/documents/$id" });
  const navigate = useNavigate();
  const fetchDoc = useServerFn(getDocument);
  const fetchMe = useServerFn(getMe);
  const review = useServerFn(reviewDocument);
  const logDownload = useServerFn(logStampedDownload);
  const delDoc = useServerFn(deleteDocument);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["document", id], queryFn: () => fetchDoc({ data: { id } }) });
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (q.isLoading || !q.data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const { doc, trainer, department, history, file_url, versions } = q.data as any;
  const status = doc.status as DocumentStatus;

  const roles = me.data?.roles ?? [];
  const canReview =
    (status === "pending_hod" && roles.includes("hod")) ||
    (status === "pending_iqa" && roles.includes("iqa"));
  const isOwner = me.data?.userId === doc.trainer_id;
  const isRejected = status === "rejected_hod" || status === "rejected_iqa" || status === "rejected_dp";
  // Trainers can resubmit a revised version when their document was rejected, or replace an approved current version.
  const canUploadNewVersion = isOwner && ((doc.is_current && status === "approved") || isRejected);
  const canDelete = roles.includes("admin") || roles.includes("deputy_principal");
  // Deputy Principal is view-only for approvals; final approval rests with IQA.

  async function handleDelete() {
    if (!confirm(`Permanently delete "${doc.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await delDoc({ data: { document_id: id } });
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      navigate({ to: "/documents" });
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function act(action: "approve" | "reject") {
    setSubmitting(action);
    try {
      await review({ data: { document_id: id, action, comment: comment || null } });
      toast.success(action === "approve" ? "Document approved and forwarded" : "Document returned with comments");
      setComment("");
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch (e: any) { toast.error(e.message ?? "Action failed"); }
    finally { setSubmitting(null); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/documents"><ArrowLeft className="mr-1 h-4 w-4" />Back to documents</Link></Button>
        {canDelete && (
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting}
            className="text-destructive hover:text-destructive">
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete document
          </Button>
        )}
      </div>

      {isRejected && isOwner && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <div className="font-semibold text-destructive">This document was rejected</div>
              <p className="text-muted-foreground">Review the reviewer's comments below, then upload a revised version to restart the review process.</p>
            </div>
            <Button asChild>
              <Link to="/documents/new" search={{ parent: doc.id }}><RefreshCw className="mr-2 h-4 w-4" />Resubmit revised version</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{doc.title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{DOC_TYPE_LABELS[doc.document_type as DocumentType]}</p>
          </div>
          <StatusBadge status={status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <Meta label="Trainer" value={trainer?.full_name || trainer?.email || "—"} />
            <Meta label="Department" value={department?.name || "—"} />
            <Meta label="Course" value={doc.course || "—"} />
            <Meta label="Unit" value={doc.subject || "—"} />
            <Meta label="Class" value={doc.class_name || "—"} />
            <Meta label="Academic Year" value={doc.academic_year || "—"} />
            <Meta label="Term" value={doc.term || "—"} />
            <Meta label="Week" value={doc.week || "—"} />
            <Meta label="Session" value={doc.session || "—"} />
            <Meta label="Version" value={`v${doc.version_number}${doc.is_current ? " (Current)" : ""}`} />
          </div>
          {doc.description && (<><div className="text-xs uppercase tracking-wider text-muted-foreground">Description</div><p className="text-sm">{doc.description}</p></>)}
          {(() => {
            const approvals = (history as any[]).filter((h) => h.action === "approve" && (h.role === "hod" || h.role === "iqa"));
            async function downloadStamped() {
              setDownloadingPdf(true);
              try {
                const bytes = await buildStampedPdf({
                  title: doc.title,
                  meta: {
                    Type: DOC_TYPE_LABELS[doc.document_type as DocumentType],
                    Trainer: trainer?.full_name || trainer?.email || "—",
                    Department: department?.name || "—",
                    Unit: doc.subject || "—",
                    Class: doc.class_name || "—",
                    "Academic Year": doc.academic_year || "—",
                    Term: doc.term || "—",
                    Week: doc.week || "—",
                    Session: doc.session || "—",
                    Status: status,
                  },
                  fileUrl: file_url || null,
                  fileName: doc.file_path?.split("/").pop() || null,
                  stamps: approvals.map((h) => ({
                    role: h.role as "hod" | "iqa",
                    approverName: h.approver?.full_name || h.approver?.email,
                    date: h.created_at,
                  })),
                });
                const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${String(doc.file_name ?? doc.title).replace(/\.[^.]+$/, "")}_stamped.pdf`;
                document.body.appendChild(a); a.click(); a.remove();
                URL.revokeObjectURL(url);
                try { await logDownload({ data: { document_id: id } }); } catch { /* non-blocking */ }
              } catch (e: any) {
                toast.error(e.message ?? "Could not generate stamped PDF");
              } finally { setDownloadingPdf(false); }
            }
            return (
              <div className="flex flex-wrap gap-2">
                {file_url && (
                  <Button asChild variant="outline">
                    <a href={file_url} download={doc.file_name} target="_blank" rel="noreferrer">
                      <Download className="mr-2 h-4 w-4" />
                      <span className="max-w-[18rem] truncate">Download {doc.file_name}</span>
                    </a>
                  </Button>
                )}

                {approvals.length > 0 && (
                  <Button onClick={downloadStamped} disabled={downloadingPdf}>
                    {downloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                    Download stamped PDF
                  </Button>
                )}
                {approvals.length > 0 && (
                  <div className="mt-2 flex w-full flex-wrap items-center gap-6 rounded-lg border border-dashed p-4">
                    {approvals.map((h) => (
                      <ApprovalStamp
                        key={h.id}
                        role={h.role as "hod" | "iqa"}
                        approverName={h.approver?.full_name || h.approver?.email}
                        date={h.created_at}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {versions && versions.length > 1 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4" />Version history</CardTitle>
            {canUploadNewVersion && (
              <Button asChild size="sm">
                <Link to="/documents/new" search={{ parent: doc.id }}><UploadCloud className="mr-2 h-4 w-4" />Upload new version</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.map((v: any) => (
              <div key={v.id} className={`flex items-center justify-between rounded-md border p-2 text-sm ${v.id === doc.id ? "bg-muted/40" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">v{v.version_number}</span>
                  {v.is_current && <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Current</span>}
                  <span className="text-muted-foreground truncate">{v.file_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={v.status as DocumentStatus} />
                  {v.id !== doc.id && (
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/documents/$id" params={{ id: v.id }}>Open</Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canUploadNewVersion && (!versions || versions.length <= 1) && (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link to="/documents/new" search={{ parent: doc.id }}><UploadCloud className="mr-2 h-4 w-4" />Upload new version</Link>
          </Button>
        </div>
      )}

      {canReview && (
        <Card>
          <CardHeader><CardTitle>Review</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea placeholder="Comments / recommendations (optional for approval, expected for rejection)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => act("reject")} disabled={submitting !== null}>
                {submitting === "reject" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}Reject
              </Button>
              <Button onClick={() => act("approve")} disabled={submitting !== null}>
                {submitting === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Approve & forward
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Approval history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {history.length === 0 && <div className="text-sm text-muted-foreground">No history yet.</div>}
          {history.map((h: any) => (
            <div key={h.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="font-medium text-foreground">
                  {h.approver?.full_name || h.approver?.email || "Unknown"} <span className="text-muted-foreground">· {ROLE_LABELS[h.role as keyof typeof ROLE_LABELS]}</span>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</div>
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Action: {h.action}</div>
              {h.comment && <div className="mt-2 text-sm">{h.comment}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
