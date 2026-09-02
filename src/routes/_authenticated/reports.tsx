import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listDocuments } from "@/lib/api/documents.functions";
import { myReportAccess } from "@/lib/api/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOC_TYPE_LABELS, STATUS_LABELS, type DocumentStatus, type DocumentType } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — WTTI SWMS" }] }),
  component: Reports,
});

const COLORS = [
  "oklch(0.45 0.18 260)", "oklch(0.5 0.2 25)", "oklch(0.6 0.15 155)",
  "oklch(0.78 0.14 75)", "oklch(0.55 0.1 250)", "oklch(0.7 0.1 195)",
  "oklch(0.4 0.08 280)", "oklch(0.65 0.15 40)", "oklch(0.5 0.12 200)",
];

type Doc = {
  id: string; title: string; document_type: DocumentType; status: DocumentStatus;
  subject: string | null; course: string | null; class_name: string | null;
  academic_year: string | null; term: string | null; week: string | null;
  created_at: string; trainer_name: string; department_name: string | null;
};

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toCsv(rows: Doc[]) {
  const cols = ["created_at", "title", "document_type", "status", "trainer_name", "department_name", "course", "subject", "class_name", "academic_year", "term", "week"];
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r: any) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Reports() {
  const fetchAccess = useServerFn(myReportAccess);
  const access = useQuery({ queryKey: ["report-access"], queryFn: () => fetchAccess() });
  const allowed = access.data?.allowed === true;
  const fetchDocs = useServerFn(listDocuments);
  const q = useQuery({
    queryKey: ["documents", "all-versions"],
    queryFn: () => fetchDocs({ data: { include_all_versions: true } }),
    enabled: allowed,
  });
  const all: Doc[] = (q.data as any) ?? [];

  const [dept, setDept] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const departments = useMemo(() => Array.from(new Set(all.map((d) => d.department_name).filter(Boolean))) as string[], [all]);
  const years = useMemo(() => Array.from(new Set(all.map((d) => d.academic_year).filter(Boolean))) as string[], [all]);

  const docs = useMemo(() => all.filter((d) => {
    if (dept !== "all" && d.department_name !== dept) return false;
    if (type !== "all" && d.document_type !== type) return false;
    if (year !== "all" && d.academic_year !== year) return false;
    if (from && new Date(d.created_at) < new Date(from)) return false;
    if (to && new Date(d.created_at) > new Date(to + "T23:59:59")) return false;
    return true;
  }), [all, dept, type, year, from, to]);

  // Aggregations
  const byStatus = useMemo(() => Object.keys(STATUS_LABELS).map((s) => ({
    name: STATUS_LABELS[s as DocumentStatus], value: docs.filter((d) => d.status === s).length,
  })), [docs]);

  const byType = useMemo(() => Object.keys(DOC_TYPE_LABELS).map((t) => ({
    name: DOC_TYPE_LABELS[t as DocumentType], value: docs.filter((d) => d.document_type === t).length,
  })).filter((x) => x.value > 0), [docs]);

  const byDept = useMemo(() => {
    const m = new Map<string, { name: string; approved: number; pending: number; rejected: number; total: number }>();
    for (const d of docs) {
      const k = d.department_name ?? "Unassigned";
      const row = m.get(k) ?? { name: k, approved: 0, pending: 0, rejected: 0, total: 0 };
      row.total++;
      if (d.status === "approved") row.approved++;
      else if (d.status.startsWith("rejected")) row.rejected++;
      else row.pending++;
      m.set(k, row);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [docs]);

  const trend = useMemo(() => {
    const m = new Map<string, { month: string; submitted: number; approved: number; rejected: number }>();
    for (const d of docs) {
      const k = monthKey(d.created_at);
      const row = m.get(k) ?? { month: k, submitted: 0, approved: 0, rejected: 0 };
      row.submitted++;
      if (d.status === "approved") row.approved++;
      if (d.status.startsWith("rejected")) row.rejected++;
      m.set(k, row);
    }
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [docs]);

  const total = docs.length;
  const approved = docs.filter((d) => d.status === "approved").length;
  const rejected = docs.filter((d) => d.status.startsWith("rejected")).length;
  const pending = total - approved - rejected;
  const approvalRate = total ? Math.round((approved / total) * 1000) / 10 : 0;
  const rejectionRate = total ? Math.round((rejected / total) * 1000) / 10 : 0;
  const compliance = total ? Math.round(((approved + pending) / total) * 1000) / 10 : 0;

  const stageRates = [
    { stage: "HOD Stage", passed: docs.filter((d) => !["pending_hod", "rejected_hod"].includes(d.status)).length, rejected: docs.filter((d) => d.status === "rejected_hod").length },
    { stage: "IQA Stage", passed: docs.filter((d) => d.status === "approved").length, rejected: docs.filter((d) => d.status === "rejected_iqa").length },
  ];

  async function exportPdf() {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const page = pdf.addPage([595, 842]);
      const { height } = page.getSize();
      let y = height - 60;
      const line = (text: string, size = 11, f = font, color = rgb(0.1, 0.1, 0.15)) => {
        page.drawText(text, { x: 50, y, size, font: f, color });
        y -= size + 6;
      };
      line("WTTI — Scheme of Work Management System", 16, bold, rgb(0.05, 0.1, 0.35));
      line("Reports & Analytics Summary", 13, bold);
      line(`Generated: ${new Date().toLocaleString()}`, 10, font, rgb(0.4, 0.4, 0.4));
      y -= 6;
      line("Filters", 12, bold);
      line(`Department: ${dept === "all" ? "All" : dept}`);
      line(`Document type: ${type === "all" ? "All" : DOC_TYPE_LABELS[type as DocumentType]}`);
      line(`Academic year: ${year === "all" ? "All" : year}`);
      line(`Date range: ${from || "—"} to ${to || "—"}`);
      y -= 6;
      line("Key metrics", 12, bold);
      line(`Total documents: ${total}`);
      line(`Approved: ${approved}   Pending: ${pending}   Rejected: ${rejected}`);
      line(`Approval rate: ${approvalRate}%   Rejection rate: ${rejectionRate}%   Compliance: ${compliance}%`);
      y -= 6;
      line("Department performance", 12, bold);
      for (const r of byDept.slice(0, 12)) {
        line(`${r.name.padEnd(28)} total ${r.total}  approved ${r.approved}  pending ${r.pending}  rejected ${r.rejected}`);
      }
      y -= 6;
      line("Monthly submission trend", 12, bold);
      for (const r of trend.slice(-12)) {
        line(`${r.month}  submitted ${r.submitted}  approved ${r.approved}  rejected ${r.rejected}`);
      }
      const bytes = await pdf.save();
      download(`wtti-report-${new Date().toISOString().slice(0, 10)}.pdf`,
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to export PDF");
    }
  }

  function exportCsv() {
    const csv = toCsv(docs);
    download(`wtti-report-${new Date().toISOString().slice(0, 10)}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }

  if (access.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-semibold text-foreground">Reports are not available for your role</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An administrator controls who can view reports. Contact the academic office if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Submission trends, approval rates, department performance, and compliance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!docs.length}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
          <Button onClick={exportPdf} disabled={!docs.length}><FileText className="mr-2 h-4 w-4" />Export PDF</Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Department</label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Document type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(Object.keys(DOC_TYPE_LABELS) as DocumentType[]).map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Academic year</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Total" value={total} />
        <Kpi label="Approval rate" value={`${approvalRate}%`} tone="success" />
        <Kpi label="Rejection rate" value={`${rejectionRate}%`} tone="destructive" />
        <Kpi label="Compliance" value={`${compliance}%`} tone="info" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Submission trend (monthly)</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="submitted" stroke={COLORS[0]} strokeWidth={2} />
                <Line type="monotone" dataKey="approved" stroke={COLORS[2]} strokeWidth={2} />
                <Line type="monotone" dataKey="rejected" stroke={COLORS[1]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Approval rates by stage</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={stageRates}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="passed" name="Passed" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Department performance</CardTitle></CardHeader>
          <CardContent style={{ height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={byDept}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="approved" stackId="s" fill={COLORS[2]} />
                <Bar dataKey="pending" stackId="s" fill={COLORS[3]} />
                <Bar dataKey="rejected" stackId="s" fill={COLORS[1]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Documents by status</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={byStatus}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Documents by type</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" outerRadius={100} label>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "destructive" | "info" }) {
  const color = tone === "success" ? "text-emerald-600" : tone === "destructive" ? "text-red-600" : tone === "info" ? "text-blue-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
