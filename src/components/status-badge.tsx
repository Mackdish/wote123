import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/types";

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const tone = STATUS_TONE[status];
  const cls = {
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
    success: "bg-success/15 text-success",
    info: "bg-primary-soft text-primary",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cls)}>{STATUS_LABELS[status]}</span>;
}
