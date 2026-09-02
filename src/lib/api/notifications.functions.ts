import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/lib/auth-middleware";

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const q = context.supabase.from("notifications").update({ read: true }).eq("user_id", context.userId);
    if (data.id) await q.eq("id", data.id);
    else await q.eq("read", false);
    return { ok: true };
  });
