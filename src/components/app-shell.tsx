import { Link, useRouter, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard, FileText, Upload, Bell, Users, Building2,
  BarChart3, ScrollText, LogOut, Menu, ShieldCheck, Megaphone, FolderTree,
  CalendarClock, SlidersHorizontal, Images,
} from "lucide-react";
import wttiLogo from "@/assets/wtti-logo.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS, type AppRole } from "@/lib/types";
import { listNotifications, markNotificationRead } from "@/lib/api/notifications.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Me = {
  userId: string;
  profile: { id: string; full_name: string; email: string; department_id: string | null; status: boolean } | null;
  roles: AppRole[];
  department: { id: string; name: string } | null;
  can_view_reports?: boolean;
  can_view_library?: boolean;
};

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <SidebarContent me={me} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-r bg-sidebar p-0 text-sidebar-foreground">
          <SidebarContent me={me} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <SheetTriggerInline onOpen={() => setMobileOpen(true)} />
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight text-foreground">{me.profile?.full_name || me.profile?.email}</div>
              <div className="text-xs text-muted-foreground">{me.roles.map((r) => ROLE_LABELS[r]).join(", ") || "No role"}</div>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SheetTriggerInline({ onOpen }: { onOpen: () => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpen}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
    </Sheet>
  );
}

function Breadcrumbs() {
  const state = useRouterState();
  const path = state.location.pathname;
  const segs = path.split("/").filter(Boolean);
  return (
    <div className="text-sm text-muted-foreground">
      {segs.length === 0 ? "Home" : segs.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="px-1">/</span>}
          <span className={i === segs.length - 1 ? "font-medium text-foreground" : ""}>{decodeURIComponent(s)}</span>
        </span>
      ))}
    </div>
  );
}

function SidebarContent({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const isAdmin = me.roles.includes("admin");
  const items = useMemo(() => [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/documents", label: "Documents", icon: FileText },
    ...(me.can_view_library ? [{ to: "/library", label: "Document Library", icon: FolderTree }] : []),
    ...(me.roles.includes("trainer") ? [{ to: "/documents/new", label: "Submit Document", icon: Upload }] : []),
    { to: "/notifications", label: "Notifications", icon: Bell },
    ...(me.can_view_reports ? [{ to: "/reports", label: "Reports", icon: BarChart3 }] : []),
    ...(isAdmin ? [
      { to: "/admin/users", label: "User Management", icon: Users },
      { to: "/admin/departments", label: "Departments", icon: Building2 },
      { to: "/admin/deadlines", label: "Deadlines", icon: CalendarClock },
      { to: "/admin/settings", label: "Access & Types", icon: SlidersHorizontal },
      { to: "/admin/homepage", label: "Homepage Images", icon: Images },
      { to: "/admin/notices", label: "Notices", icon: Megaphone },
      { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
    ] : []),
  ], [me.roles, isAdmin, me.can_view_reports, me.can_view_library]);

  const state = useRouterState();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <img src={wttiLogo} alt="WTTI" className="h-9 w-auto rounded-md bg-white object-contain p-0.5" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">WTTI SWMS</div>
          <div className="text-[11px] uppercase tracking-wider opacity-75">Academic Workflow</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => {
          const active = state.location.pathname === it.to || (it.to !== "/dashboard" && state.location.pathname.startsWith(it.to));
          return (
            <Link key={it.to} to={it.to} onClick={onNavigate}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60")}>
              <it.icon className="h-4 w-4" />{it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4 text-xs opacity-80">
        <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" /> {me.department?.name || "No department"}</div>
        <div className="mt-1">Signed in as {me.profile?.email}</div>
      </div>
    </div>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function out() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <Button variant="ghost" size="icon" onClick={out} title="Sign out">
      <LogOut className="h-4 w-4" />
    </Button>
  );
}

function NotificationsBell() {
  const fetchList = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const router = useRouter();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => fetchList(), refetchInterval: 30000 });
  const unread = (q.data ?? []).filter((n: any) => !n.read).length;

  async function mark(id?: string) {
    await markRead({ data: id ? { id } : { all: true } });
    q.refetch();
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && <Button size="sm" variant="ghost" onClick={() => mark()}>Mark all read</Button>}
        </div>
        <ScrollArea className="h-96">
          {(q.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (q.data ?? []).map((n: any) => (
            <button key={n.id} onClick={() => { mark(n.id); if (n.link) router.navigate({ to: n.link }); }}
              className={cn("block w-full border-b px-4 py-3 text-left text-sm hover:bg-accent/30", !n.read && "bg-primary-soft/40")}>
              <div className="font-medium text-foreground">{n.title}</div>
              <div className="text-xs text-muted-foreground">{n.message}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
