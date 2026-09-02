import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { adminAuditLogs, listDepartments } from "@/lib/api/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DOC_TYPE_LABELS, STATUS_LABELS, type DocumentStatus, type DocumentType,
} from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { Search, X, ExternalLink, Bookmark, Trash2, Star } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — WTTI SWMS" }] }),
  component: AuditLogs,
});

const ANY = "__any__";

function AuditLogs() {
  const fetchLogs = useServerFn(adminAuditLogs);
  const fetchDepts = useServerFn(listDepartments);
  const q = useQuery({ queryKey: ["audit-logs"], queryFn: () => fetchLogs() });
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => fetchDepts() });

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<string>(ANY);
  const [deptId, setDeptId] = useState<string>(ANY);
  const [status, setStatus] = useState<string>(ANY);
  const [year, setYear] = useState<string>(ANY);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const rows: any[] = q.data ?? [];

  // Unique academic years from loaded rows
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.document?.academic_year) s.add(r.document.academic_year);
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const term = search.trim().toLowerCase();

    return rows.filter((r) => {
      if (docType !== ANY && r.document?.document_type !== docType) return false;
      if (deptId !== ANY && r.document?.department_id !== deptId) return false;
      if (status !== ANY && r.document?.status !== status) return false;
      if (year !== ANY && r.document?.academic_year !== year) return false;
      const ts = new Date(r.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (term) {
        const hay = [
          r.action,
          r.document?.title,
          r.actor?.full_name,
          r.actor?.email,
          JSON.stringify(r.details ?? {}),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, docType, deptId, status, year, from, to]);

  const activeFilters =
    (docType !== ANY ? 1 : 0) +
    (deptId !== ANY ? 1 : 0) +
    (status !== ANY ? 1 : 0) +
    (year !== ANY ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0) +
    (search ? 1 : 0);

  function clearAll() {
    setSearch(""); setDocType(ANY); setDeptId(ANY); setStatus(ANY); setYear(ANY); setFrom(""); setTo("");
  }

  // ---- Saved filter presets (per-user, localStorage) ----
  const [presets, setPresets] = useState<Preset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => { setPresets(loadPresets()); }, []);

  function applyPreset(p: Preset) {
    setSearch(p.filters.search ?? "");
    setDocType(p.filters.docType ?? ANY);
    setDeptId(p.filters.deptId ?? ANY);
    setStatus(p.filters.status ?? ANY);
    setYear(p.filters.year ?? ANY);
    setFrom(p.filters.from ?? "");
    setTo(p.filters.to ?? "");
    toast.success(`Applied "${p.name}"`);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const next: Preset = {
      id: crypto.randomUUID(),
      name,
      filters: { search, docType, deptId, status, year, from, to },
    };
    const existing = presets.filter((p) => p.name !== name);
    const updated = [...existing, next].sort((a, b) => a.name.localeCompare(b.name));
    setPresets(updated);
    savePresets(updated);
    setPresetName("");
    setSaveOpen(false);
    toast.success(`Saved "${name}"`);
  }

  function deletePreset(id: string) {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    savePresets(updated);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {rows.length} entries
            {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Bookmark className="mr-1.5 h-3.5 w-3.5" />
                Presets {presets.length > 0 && <span className="ml-1 text-muted-foreground">({presets.length})</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {presets.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  No saved filters yet. Configure filters and click "Save preset".
                </div>
              ) : presets.map((p) => (
                <DropdownMenuItem key={p.id} className="flex items-center justify-between gap-2" onSelect={(e) => { e.preventDefault(); applyPreset(p); }}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={activeFilters === 0}>
                <Bookmark className="mr-1.5 h-3.5 w-3.5" /> Save preset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Save filter preset</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="preset-name">Name</Label>
                <Input
                  id="preset-name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g. Rejected schemes — this term"
                  onKeyDown={(e) => { if (e.key === "Enter") savePreset(); }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Reusing an existing name will overwrite it.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
                <Button onClick={savePreset} disabled={!presetName.trim()}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>


      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, document title, user, or details…"
              className="pl-9"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FilterField label="Document type">
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any type</SelectItem>
                  {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((t) => (
                    <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Department">
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any department</SelectItem>
                  {(depts.data ?? []).map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Academic year">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any year</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any status</SelectItem>
                  {(Object.keys(STATUS_LABELS) as DocumentStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="From date">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </FilterField>

            <FilterField label="To date">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </FilterField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No logs yet." : "No entries match your filters."}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((l: any) => (
                <div key={l.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{l.action}</span>
                      {l.actor && (
                        <span className="text-xs text-muted-foreground">
                          by {l.actor.full_name || l.actor.email}
                        </span>
                      )}
                      {l.document?.status && <StatusBadge status={l.document.status as DocumentStatus} />}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  </div>
                  {l.document && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Link
                        to="/documents/$id"
                        params={{ id: l.document.id }}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {l.document.title}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      <span>·</span>
                      <span>{DOC_TYPE_LABELS[l.document.document_type as DocumentType]}</span>
                      {l.document.department_name && (<><span>·</span><span>{l.document.department_name}</span></>)}
                      {l.document.academic_year && (<><span>·</span><span>{l.document.academic_year}</span></>)}
                    </div>
                  )}
                  {l.details && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(l.details, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

type Preset = {
  id: string;
  name: string;
  filters: {
    search: string;
    docType: string;
    deptId: string;
    status: string;
    year: string;
    from: string;
    to: string;
  };
};

const PRESETS_KEY = "wtti.audit.presets.v1";

function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { /* ignore */ }
}
