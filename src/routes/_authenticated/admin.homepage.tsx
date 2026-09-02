import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { getMe } from "@/lib/api/auth.functions";
import { addHomepageImage, deleteHomepageImage, listHomepageImages, updateHomepageImage } from "@/lib/api/settings.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/homepage")({
  head: () => ({
    meta: [
      { title: "Homepage Images — WTTI SWMS" },
      { name: "description", content: "Manage the institutional images shown on the public homepage." },
    ],
  }),
  component: HomepageImagesPage,
});

function HomepageImagesPage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isAdmin = me.data?.roles.includes("admin");

  const fetchList = useServerFn(listHomepageImages);
  const addImage = useServerFn(addHomepageImage);
  const patchImage = useServerFn(updateHomepageImage);
  const delImage = useServerFn(deleteHomepageImage);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["homepage-images"], queryFn: () => fetchList(), enabled: !!isAdmin });

  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  if (me.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Administrators only.</div>;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Choose an image first"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `homepage/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("site-images").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw new Error(error.message);
      await addImage({ data: { storage_path: path, caption: caption || null, sort_order: (list.data?.length ?? 0) + 1 } });
      toast.success("Image added to homepage");
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["homepage-images"] });
      qc.invalidateQueries({ queryKey: ["public-homepage-images"] });
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Remove this image from the homepage?")) return;
    try {
      await delImage({ data: { id } });
      qc.invalidateQueries({ queryKey: ["homepage-images"] });
      qc.invalidateQueries({ queryKey: ["public-homepage-images"] });
    } catch (e: any) { toast.error(e.message ?? "Could not delete"); }
  }

  async function toggle(id: string, active: boolean) {
    try {
      await patchImage({ data: { id, active } });
      qc.invalidateQueries({ queryKey: ["homepage-images"] });
      qc.invalidateQueries({ queryKey: ["public-homepage-images"] });
    } catch (e: any) { toast.error(e.message ?? "Could not update"); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Homepage images</h1>
        <p className="text-sm text-muted-foreground">Upload institutional photos shown in the gallery on the public homepage.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Add an image</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label>Image file</Label>
            <Input ref={fileRef} type="file" accept="image/*" />
          </div>
          <div>
            <Label>Caption (optional)</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Workshop practical session" />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={upload} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}Upload
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Gallery</CardTitle></CardHeader>
        <CardContent>
          {list.isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div> :
            (list.data ?? []).length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No images yet.</div> :
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(list.data ?? []).map((img: any) => (
                <div key={img.id} className="overflow-hidden rounded-xl border bg-card">
                  {img.url && <img src={img.url} alt={img.caption || "Homepage image"} className="h-40 w-full object-cover" />}
                  <div className="space-y-2 p-3">
                    <div className="text-sm font-medium">{img.caption || "Untitled"}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={img.active} onCheckedChange={(v) => toggle(img.id, v)} />
                        {img.active ? "Visible" : "Hidden"}
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(img.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
