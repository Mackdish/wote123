import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listDocuments } from "@/lib/api/documents.functions";
import { listDeadlines, listDocumentTypeSettings } from "@/lib/api/settings.functions";
import { listVisibleProfiles } from "@/lib/api/admin.functions";
import { getMe } from "@/lib/api/auth.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { DOC_TYPE_LABELS, STATUS_LABELS, type DocumentStatus, type DocumentType } from "@/lib/types";
import { Building2, ChevronRight, FolderOpen, FileText, User, ArrowLeft, Home, Folder } from "lucide-react";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Document Library — WTTI SWMS" },
      { name: "description", content: "Browse WTTI academic documents by department and trainer folders, with status, type and period filters." },
      { property: "og:title", content: "Document Library — WTTI SWMS" },
      { property: "og:description", content: "Departmental folders with per-trainer document collections and review filters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

type Doc = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  subject: string | null;
  course: string | null;
  class_name: string | null;
  academic_year: string | null;
  term: string | null;
  week: string | null;
  created_at: string;
  file_name: string | null;
  trainer_id: string;
  trainer_name: string;
  department_id: string | null;
  department_name: string | null;
};

const REVIEW_STAGES: Record<string, DocumentStatus[]> = {
  all: [],
  approved: ["approved"],
  awaiting_dp: ["pending_dp"],
  qa_cleared: ["pending_dp", "approved"],
  in_review: ["pending_hod", "pending_iqa", "pending_dp"],
  rejected: ["rejected_hod", "rejected_iqa", "rejected_dp"],
};

const STAGE_LABELS: Record<string, string> = {
  all: "All stages",
  qa_cleared: "HOD + IQA approved",
  awaiting_dp: "Awaiting Deputy Principal",
  approved: "Finally approved",
  in_review: "Still in review",
  rejected: "Returned / rejected",
};

function LibraryPage() {
  const fetchDocs = useServerFn(listDocuments);
  const fetchMe = useServerFn(getMe);
  const fetchDeadlines = useServerFn(listDeadlines);
  const fetchProfiles = useServerFn(listVisibleProfiles);
  const fetchTypes = useServerFn(listDocumentTypeSettings);
  const docsQ = useQuery({ queryKey: ["documents"], queryFn: () => fetchDocs() });
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const deadlinesQ = useQuery({ queryKey: ["deadlines"], queryFn: () => fetchDeadlines() });
  const peopleQ = useQuery({
    queryKey: ["visible-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: !!me.data?.can_view_library,
  });
  const typesQ = useQuery({ queryKey: ["doc-type-settings"], queryFn: () => fetchTypes() });

  const roles = me.data?.roles ?? [];
  const isDp = roles.includes("deputy_principal");
  const canViewLibrary = me.data?.can_view_library ?? false;

  const [dept, setDept] = useState<string | null>(null);
  const [trainer, setTrainer] = useState<string | null>(null);
  const [typeFolder, setTypeFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [stage, setStage] = useState<string>(isDp ? "qa_cleared" : "all");
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState("all");
  const [term, setTerm] = useState("all");

  const all = (docsQ.data ?? []) as Doc[];

  const years = useMemo(
    () => Array.from(new Set(all.map((d) => d.academic_year).filter(Boolean))).sort() as string[],
    [all],
  );
  const terms = useMemo(
    () => Array.from(new Set(all.map((d) => d.term).filter(Boolean))).sort() as string[],
    [all],
  );

  const filtered = useMemo(() => {
    const stageStatuses = REVIEW_STAGES[stage] ?? [];
    return all.filter((d) => {
      if (stageStatuses.length && !stageStatuses.includes(d.status as DocumentStatus)) return false;
      if (status !== "all" && d.status !== status) return false;
      if (type !== "all" && d.document_type !== type) return false;
      if (year !== "all" && d.academic_year !== year) return false;
      if (term !== "all" && d.term !== term) return false;
      if (search) {
        const hay = `${d.title} ${d.subject ?? ""} ${d.course ?? ""} ${d.class_name ?? ""} ${d.trainer_name} ${d.department_name ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [all, stage, status, type, year, term, search]);

  const people = (peopleQ.data ?? []) as { id: string; full_name: string; email: string; department_id: string | null }[];

  const deptFolders = useMemo(() => {
    const map = new Map<string, { id: string; name: string; docs: Doc[]; trainers: Set<string> }>();
    for (const d of filtered) {
      const id = d.department_id ?? "unassigned";
      const name = d.department_name ?? "Unassigned";
      if (!map.has(id)) map.set(id, { id, name, docs: [], trainers: new Set() });
      const f = map.get(id)!;
      f.docs.push(d);
      f.trainers.add(d.trainer_id);
    }
    // count staff folders that exist even without documents
    for (const p of people) {
      const id = p.department_id ?? "unassigned";
      if (map.has(id)) map.get(id)!.trainers.add(p.id);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, people]);

  const activeDept = deptFolders.find((f) => f.id === dept) ?? null;

  const trainerFolders = useMemo(() => {
    if (!activeDept) return [];
    const map = new Map<string, { id: string; name: string; docs: Doc[] }>();
    // every person in this department gets a folder, even an empty one
    for (const p of people) {
      const pid = p.department_id ?? "unassigned";
      if (pid !== activeDept.id) continue;
      map.set(p.id, { id: p.id, name: p.full_name?.trim() || p.email, docs: [] });
    }
    for (const d of activeDept.docs) {
      if (!map.has(d.trainer_id)) map.set(d.trainer_id, { id: d.trainer_id, name: d.trainer_name, docs: [] });
      map.get(d.trainer_id)!.docs.push(d);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeDept, people]);

  const activeTrainer = trainerFolders.find((t) => t.id === trainer) ?? null;

  const deadlines = (deadlinesQ.data ?? []) as any[];

  const timelinessOf = (d: Doc) => {
    const matches = deadlines.filter((dl) =>
      dl.document_type === d.document_type &&
      (dl.department_id == null || dl.department_id === d.department_id) &&
      (!dl.academic_year || dl.academic_year === d.academic_year) &&
      (!dl.term || dl.term === d.term));
    if (!matches.length) return null;
    // department-specific deadlines take precedence over institute-wide ones
    matches.sort((a, b) => (a.department_id ? 0 : 1) - (b.department_id ? 0 : 1));
    const dl = matches[0];
    const due = new Date(`${dl.due_date}T23:59:59`);
    const submitted = new Date(d.created_at);
    return {
      late: submitted > due,
      dueLabel: due.toLocaleDateString(),
    };
  };

  const activeTypeSettings = ((typesQ.data ?? []) as any[]).filter((t) => t.active);

  const typeFolders = useMemo(() => {
    if (!activeTrainer) return [];
    const map = new Map<string, { id: string; name: string; docs: Doc[] }>();
    // show every active document category, so each trainer folder is fully categorized
    for (const t of activeTypeSettings) {
      map.set(t.document_type, {
        id: t.document_type,
        name: t.label ?? DOC_TYPE_LABELS[t.document_type as DocumentType] ?? t.document_type,
        docs: [],
      });
    }
    for (const d of activeTrainer.docs) {
      const id = d.document_type;
      if (!map.has(id)) map.set(id, { id, name: DOC_TYPE_LABELS[id as DocumentType] ?? id, docs: [] });
      map.get(id)!.docs.push(d);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTrainer, typesQ.data]);

  const activeType = typeFolders.find((t) => t.id === typeFolder) ?? null;

  const resetFilters = () => {
    setSearch(""); setType("all"); setStatus("all"); setYear("all"); setTerm("all"); setStage("all");
  };

  if (!me.isLoading && !canViewLibrary) {
    return (
      <Card>
        <CardContent className="space-y-2 p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Document Library is restricted</h1>
          <p className="text-sm text-muted-foreground">
            This organisation-wide folder view is limited to the Deputy Principal and Administrators.
            Use the Documents page to review submissions for your department.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Document Library</h1>
          <p className="text-sm text-muted-foreground">
            Documents organised by department, then by trainer folder. HOD and Quality Assurance approvals feed straight into this view.
          </p>
        </div>
        <Button variant="outline" onClick={resetFilters}>Clear filters</Button>
      </div>

      {/* Breadcrumb trail */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent/30" onClick={() => { setDept(null); setTrainer(null); setTypeFolder(null); }}>
          <Home className="h-3.5 w-3.5" /> Departments
        </button>
        {activeDept && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button className="rounded px-2 py-1 hover:bg-accent/30" onClick={() => { setTrainer(null); setTypeFolder(null); }}>{activeDept.name}</button>
          </>
        )}
        {activeTrainer && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button className="rounded px-2 py-1 font-medium hover:bg-accent/30" onClick={() => setTypeFolder(null)}>{activeTrainer.name}</button>
          </>
        )}
        {activeType && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="px-2 py-1 font-medium">{activeType.name}</span>
          </>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Input placeholder="Search title, subject, course, trainer…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-56 flex-1" />
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Approval stage" /></SelectTrigger>
            <SelectContent>
              {Object.keys(STAGE_LABELS).map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as DocumentStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Term" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All terms</SelectItem>
              {terms.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {docsQ.isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading library…</CardContent></Card>
      ) : !activeDept ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deptFolders.length === 0 && (
            <Card className="sm:col-span-2 lg:col-span-3"><CardContent className="p-8 text-center text-sm text-muted-foreground">No documents match these filters.</CardContent></Card>
          )}
          {deptFolders.map((f) => (
            <button key={f.id} onClick={() => { setDept(f.id); setTrainer(null); setTypeFolder(null); }} className="text-left">
              <Card className="h-full transition hover:border-primary hover:shadow-sm">
                <CardContent className="flex items-start gap-3 p-5">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary"><Building2 className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{f.trainers.size} trainer folder{f.trainers.size === 1 ? "" : "s"} · {f.docs.length} document{f.docs.length === 1 ? "" : "s"}</div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      ) : !activeTrainer ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setDept(null)}><ArrowLeft className="mr-2 h-4 w-4" />All departments</Button>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trainerFolders.map((t) => (
              <button key={t.id} onClick={() => { setTrainer(t.id); setTypeFolder(null); }} className="text-left">
                <Card className="h-full transition hover:border-primary hover:shadow-sm">
                  <CardContent className="flex items-start gap-3 p-5">
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent/40 text-foreground"><User className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.docs.length} document{t.docs.length === 1 ? "" : "s"}</div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      ) : !activeType ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setTrainer(null)}><ArrowLeft className="mr-2 h-4 w-4" />{activeDept.name} folders</Button>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {typeFolders.map((t) => (
              <button key={t.id} onClick={() => setTypeFolder(t.id)} className="text-left">
                <Card className="h-full transition hover:border-primary hover:shadow-sm">
                  <CardContent className="flex items-start gap-3 p-5">
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-foreground"><Folder className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.docs.length} document{t.docs.length === 1 ? "" : "s"}</div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setTypeFolder(null)}><ArrowLeft className="mr-2 h-4 w-4" />{activeTrainer.name} folders</Button>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{activeTrainer.name} — {activeType.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {activeType.docs.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">No documents in this category yet.</div>
                )}
                {activeType.docs.map((d) => {
                  const timing = timelinessOf(d);
                  return (
                    <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/20">
                      <div className="flex min-w-0 items-start gap-3">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {d.file_name ?? "No file name"}
                            {d.course ? ` · ${d.course}` : ""}{d.class_name ? ` · ${d.class_name}` : ""}
                            {d.academic_year ? ` · ${d.academic_year}` : ""}{d.term ? ` · ${d.term}` : ""}{d.week ? ` · Week ${d.week}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {timing && (
                          <span
                            title={`Due ${timing.dueLabel}`}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${timing.late ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}
                          >
                            {timing.late ? "Late" : "On time"}
                          </span>
                        )}
                        <StatusBadge status={d.status as DocumentStatus} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
