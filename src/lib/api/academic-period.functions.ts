import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";

const periodSchema = z.object({
  academic_year: z.string().trim().min(4).max(20),
  term: z.string().trim().min(1).max(20),
});

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data?.length) throw new Error("Forbidden: administrator only");
}

export const getAcademicPeriod = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("academic_period_settings").select("academic_year, term, updated_at").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Academic year and term have not been configured by the administrator.");
    return data;
  });

export const setAcademicPeriod = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => periodSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { error } = await supabase.from("academic_period_settings").upsert({
      id: 1,
      academic_year: data.academic_year,
      term: data.term,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    await supabase.rpc("log_audit", { _action: "admin.academic_period_changed", _details: { academic_year: data.academic_year, term: data.term } });
    return { ok: true };
  });
