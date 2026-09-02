import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNotifications, markNotificationRead } from "@/lib/api/notifications.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — WTTI SWMS" }] }),
  component: Notifications,
});

function Notifications() {
  const fetchList = useServerFn(listNotifications);
  const mark = useServerFn(markNotificationRead);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => fetchList() });

  async function markAll() {
    await mark({ data: { all: true } });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("All notifications marked as read");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Button variant="outline" onClick={markAll}>Mark all as read</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {(q.data ?? []).length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No notifications</div> :
            <div className="divide-y">
              {(q.data ?? []).map((n: any) => (
                <Link key={n.id} to={n.link ?? "/notifications"} className={`block px-4 py-3 hover:bg-accent/20 ${!n.read ? "bg-primary-soft/30" : ""}`}>
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-sm text-muted-foreground">{n.message}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
