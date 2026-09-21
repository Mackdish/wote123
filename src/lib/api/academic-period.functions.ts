import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";

const periodSchema = z.object({
  academic_year: z.string().trim().min(4).max(20),
  term: z.string().trim().min(1).max(20),
});

// Academic period is intentionally client-side configuration. These server
// functions remain as compatibility shims for older callers, but they no
// longer query or write an academic_period_settings table.
export const getAcademicPeriod = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const year = new Date().getFullYear();
    return {
      academic_year: `${year}/${year + 1}`,
      term: "Term 1",
    };
  });

export const setAcademicPeriod = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => periodSchema.parse(d))
  .handler(async ({ data }) => ({
    ok: true,
    academic_year: data.academic_year,
    term: data.term,
  }));
