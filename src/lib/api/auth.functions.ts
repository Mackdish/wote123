import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/lib/auth-middleware";
import type { AppRole } from "@/lib/types";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, department_id, status, deleted_at").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (!profile) {
      // Creates the profile (and a default trainer role) via a security-definer RPC.
      await supabase.rpc("ensure_my_profile");
      const [{ data: p2 }, { data: r2 }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, department_id, status, deleted_at").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      profile = p2 ?? null;
      roles = r2 ?? roles;
    }
    if (profile?.deleted_at) throw new Error("Account deleted. Contact an administrator.");
    let department: { id: string; name: string } | null = null;
    if (profile?.department_id) {
      const { data: dept } = await supabase.from("departments").select("id, name").eq("id", profile.department_id).maybeSingle();
      if (dept) department = dept;
    }
    const [{ data: canViewReports }, { data: canViewLibrary }] = await Promise.all([
      supabase.rpc("can_view_reports", { _user_id: userId }),
      supabase.rpc("can_view_library", { _user_id: userId }),
    ]);
    return {
      userId,
      profile: profile ?? null,
      roles: (roles?.map((r) => r.role) ?? []) as AppRole[],
      department,
      can_view_reports: Boolean(canViewReports),
      can_view_library: Boolean(canViewLibrary),
    };
  });
