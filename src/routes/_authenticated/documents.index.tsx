import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { listDocuments } from "@/lib/api/documents.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { DOC_TYPE_LABELS, STATUS_LABELS, type DocumentStatus, type DocumentType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({ meta: [{ title: "Documents — WTTI SWMS" }] }),
  component: DocsList,
});

function DocsList() {
  const fetchDocs = useServerFn(listDocuments);
  const q = useQuery({ queryKey: ["documents"], queryFn: () => fetchDocs() });
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => (q.data ?? []).filter((d: any) => {
    if (type !== "all" && d.document_type !== type) return false;
    if (status !== "all" && d.status !== status) return false;
    if (search && !`${d.title} ${d.subject ?? ""} ${d.trainer_name}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [q.data, search, type, status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground">All documents you have access to</p>
        </div>
        <Button asChild><Link to="/documents/new"><Upload className="mr-2 h-4 w-4" />Submit document</Link></Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Input placeholder="Search title, subject, trainer…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-64 flex-1" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as DocumentStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div> :
            filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No documents found.</div> :
            <div className="divide-y">
              {filtered.map((d: any) => (
                <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="grid grid-cols-1 gap-2 px-4 py-3 hover:bg-accent/20 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{d.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {DOC_TYPE_LABELS[d.document_type as DocumentType]} · {d.trainer_name} · {d.department_name ?? "—"}
                      {d.academic_year ? ` · ${d.academic_year}` : ""}{d.term ? ` · ${d.term}` : ""}{d.week ? ` · Week ${d.week}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={d.status as DocumentStatus} />
                </Link>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
