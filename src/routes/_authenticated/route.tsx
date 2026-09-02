import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/api/auth.functions";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  useEffect(() => {
    if (me.error) {
      const status = me.error instanceof Response ? me.error.status : undefined;
      if (status === 401) {
        supabase.auth.signOut().then(() => navigate({ to: "/auth", replace: true }));
      }
    }
  }, [me.error, navigate]);

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (me.error || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Your account could not be loaded</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The deployment could not reach your account data. Try again, or sign out and sign back in.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button
              type="button"
              onClick={() => me.refetch()}
            >
              Try again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/auth", replace: true }))}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <AppShell me={me.data}>
      <Outlet />
    </AppShell>
  );
}
