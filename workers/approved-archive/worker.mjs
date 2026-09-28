import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2500);
const STAMP_W = 200;
const STAMP_MARGIN = 30;
const STAMP_GAP = 24;
const BLUE = rgb(0.12, 0.23, 0.54);
const PURPLE = rgb(0.43, 0.18, 0.57);
const DOC_TYPE_LABELS = {
  scheme_of_work: "Scheme of Work",
  session_plan: "Session Plan",
  record_of_work: "Record of Work",
  training_program: "Training Program",
  learning_plan: "Learning Plan",
  lesson_notes: "Lesson Notes",
  assessment_document: "Assessment Document",
  iqa_document: "IQA Document",
  course_outline: "Course Outline",
  other: "Other Official Document",
};

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the archive worker.");
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stampBytes = {
  hod: await readFile(new URL("./assets/hod-stamp.png", import.meta.url)),
  iqa: await readFile(new URL("./assets/iqa-stamp.png", import.meta.url)),
};

function scopeKey(departmentId) {
  return departmentId ? `department:${departmentId}` : "all";
}

async function computeSignature(docs, approvals) {
  const payload = [
    "stamped-v2",
    ...docs.map((d) => `${d.id}|${d.created_at}`),
    ...approvals.map((a) => `${a.document_id}|${a.role}|${a.action}|${a.approver_id ?? ""}|${a.created_at ?? ""}`),
  ].join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function stampDate(stamp) {
  return stamp.date ? new Date(stamp.date).toLocaleDateString() : new Date().toLocaleDateString();
}

function drawStamp(page, image, font, stamp, x, y) {
  const width = STAMP_W;
  const height = image.height * (width / image.width);
  const dateLine = `DATE: ${stampDate(stamp)}: APPROVED`;
  page.drawImage(image, { x, y: y + 18, width, height });
  const color = stamp.role === "hod" ? PURPLE : BLUE;
  const fontSize = stamp.role === "hod" ? 9 : 8;
  const dateWidth = font.widthOfTextAtSize(dateLine, fontSize);
  const dateY = stamp.role === "hod" ? y + 18 + height * 0.2 : y + 4;
  page.drawText(dateLine, {
    x: x + (width - dateWidth) / 2,
    y: dateY,
    size: fontSize,
    font,
    color,
  });
}

async function stampPdf(bytes, stamps, name) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const uniqueRoles = [...new Set(stamps.map((s) => s.role))];
  const images = {};
  for (const role of uniqueRoles) images[role] = await pdf.embedPng(stampBytes[role]);

  const maxHeight = stamps.reduce((max, stamp) => {
    const image = images[stamp.role];
    return Math.max(max, image.height * (STAMP_W / image.width));
  }, 0);
  const reserve = maxHeight + 40 + STAMP_MARGIN * 2;
  const pages = pdf.getPages();
  if (!pages.length) throw new Error(`"${name}" contains no PDF pages.`);
  const page = pages[pages.length - 1];
  const box = page.getMediaBox();
  page.setMediaBox(box.x, box.y - reserve, box.width, box.height + reserve);
  try {
    page.setCropBox(box.x, box.y - reserve, box.width, box.height + reserve);
  } catch { /* Some PDFs do not expose a writable crop box. */ }

  const totalWidth = stamps.length * STAMP_W + Math.max(0, stamps.length - 1) * STAMP_GAP;
  const startX = Math.max(STAMP_MARGIN, (page.getWidth() - totalWidth) / 2);
  const y = box.y - reserve + STAMP_MARGIN;
  for (let i = 0; i < stamps.length; i++) {
    const x = startX + i * (STAMP_W + STAMP_GAP);
    if (x + STAMP_W > page.getWidth() - STAMP_MARGIN) break;
    drawStamp(page, images[stamps[i].role], font, stamps[i], x, y);
  }
  return Buffer.from(await pdf.save());
}

function runLibreOffice(sourcePath, outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn("soffice", [
      "--headless",
      "--convert-to", "pdf",
      "--outdir", outputDir,
      sourcePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`LibreOffice conversion failed (${code}): ${stderr || stdout}`));
      else resolve();
    });
  });
}

async function convertOfficeToPdf(bytes, fileName, workDir) {
  const safeBase = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
  const inputDir = path.join(workDir, "input");
  const outputDir = path.join(workDir, "output");
  const profileDir = path.join(workDir, "lo-profile");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(inputDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  const sourcePath = path.join(inputDir, safeBase + path.extname(fileName).toLowerCase());
  await writeFile(sourcePath, bytes);
  await new Promise((resolve, reject) => {
    const child = spawn("soffice", [
      "-env:UserInstallation=file://" + profileDir,
      "--headless",
      "--convert-to", "pdf",
      "--outdir", outputDir,
      sourcePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Office conversion failed (${code}): ${stderr}`));
      else resolve();
    });
  });
  const pdfPath = path.join(outputDir, safeBase + ".pdf");
  return readFile(pdfPath);
}

async function loadArchiveData(departmentId) {
  let query = supabase.from("documents")
    .select("id,title,file_path,file_name,document_type,academic_year,term,department_id,created_at")
    .eq("status", "approved")
    .order("id", { ascending: true });
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data: docs, error } = await query;
  if (error) throw error;
  const rows = docs ?? [];
  const ids = rows.map((d) => d.id);
  let approvals = [];
  if (ids.length) {
    const { data, error: approvalError } = await supabase.from("approval_history")
      .select("document_id,role,action,approver_id,created_at")
      .in("document_id", ids)
      .eq("action", "approve")
      .in("role", ["hod", "iqa"])
      .order("created_at", { ascending: true });
    if (approvalError) throw approvalError;
    approvals = data ?? [];
  }

  const approverIds = [...new Set(approvals.map((a) => a.approver_id).filter(Boolean))];
  const deptIds = [...new Set(rows.map((d) => d.department_id).filter(Boolean))];
  const [profileResult, deptResult] = await Promise.all([
    approverIds.length
      ? supabase.from("profiles").select("id,full_name,email").in("id", approverIds)
      : Promise.resolve({ data: [], error: null }),
    deptIds.length
      ? supabase.from("departments").select("id,name").in("id", deptIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (deptResult.error) throw deptResult.error;
  const profiles = new Map((profileResult.data ?? []).map((p) => [p.id, p]));
  const departments = new Map((deptResult.data ?? []).map((d) => [d.id, d.name]));
  const stamps = new Map();
  for (const approval of approvals) {
    const profile = profiles.get(approval.approver_id);
    const list = stamps.get(approval.document_id) ?? [];
    list.push({
      role: approval.role,
      approverName: profile?.full_name || profile?.email || null,
      date: approval.created_at,
    });
    stamps.set(approval.document_id, list);
  }
  return {
    docs: rows,
    approvals,
    departments,
    stamps,
    signature: await computeSignature(rows, approvals),
  };
}

async function buildArchive(job) {
  const departmentId = job.department_id ?? null;
  const { docs, departments, stamps, signature } = await loadArchiveData(departmentId);
  if (!docs.length) {
    await supabase.from("bundle_cache").delete().is("department_id", departmentId);
    return { empty: true, signature, count: 0, size: 0 };
  }

  const zip = new JSZip();
  for (const doc of docs) {
    if (!doc.file_path) throw new Error(`Approved document "${doc.title}" has no storage path.`);
    const { data: file, error } = await supabase.storage.from("documents").download(doc.file_path);
    if (error || !file) throw new Error(`Could not download "${doc.file_name || doc.title}" from Storage: ${error?.message || "missing file"}`);
    const original = Buffer.from(await file.arrayBuffer());
    const name = doc.file_name || `${doc.title || "document"}.bin`;
    const ext = path.extname(name).toLowerCase();
    const itemStamps = (stamps.get(doc.id) ?? []).filter((s) => s.role === "hod" || s.role === "iqa");
    const hasHod = itemStamps.some((s) => s.role === "hod");
    const hasIqa = itemStamps.some((s) => s.role === "iqa");
    const folder = zip.folder(departments.get(doc.department_id) || "Unassigned")
      .folder(DOC_TYPE_LABELS[doc.document_type] || "Documents");

    if ([".pdf", ".docx", ".docm"].includes(ext)) {
      if (!hasHod || !hasIqa) throw new Error(`"${name}" is approved but is missing HOD/IQA approval records.`);
      let pdfBytes = original;
      if (ext === ".docx" || ext === ".docm") {
        const workDir = await mkdtemp(path.join(tmpdir(), "wtti-doc-"));
        try {
          pdfBytes = await convertOfficeToPdf(original, name, workDir);
        } finally {
          await rm(workDir, { recursive: true, force: true });
        }
      }
      const stamped = await stampPdf(pdfBytes, itemStamps, name);
      folder.file(name.replace(/\.[^.]+$/, "") + "_stamped.pdf", stamped, { binary: true });
    } else {
      folder.file(name, original, { binary: true });
    }
  }

  const zipBytes = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const scope = departmentId ?? "all";
  const storagePath = `_stamped_bundles/${scope}-${signature}-${Date.now()}.zip`;
  const { error: uploadError } = await supabase.storage.from("documents")
    .upload(storagePath, zipBytes, { contentType: "application/zip", upsert: true });
  if (uploadError) throw uploadError;

  const { data: adminRole, error: adminError } = await supabase.from("user_roles")
    .select("user_id").eq("role", "admin").limit(1).maybeSingle();
  if (adminError) throw adminError;
  if (!adminRole?.user_id) throw new Error("No administrator account is available to own the archive cache record.");

  let oldQuery = supabase.from("bundle_cache").select("id,storage_path").eq("department_id", departmentId);
  if (departmentId === null) oldQuery = supabase.from("bundle_cache").select("id,storage_path").is("department_id", null);
  const { data: oldRows, error: oldError } = await oldQuery;
  if (oldError) throw oldError;
  const oldPaths = (oldRows ?? []).map((r) => r.storage_path).filter((p) => p && p !== storagePath);
  if (oldPaths.length) await supabase.storage.from("documents").remove(oldPaths);
  const { error: deleteError } = await supabase.from("bundle_cache").delete().eq("department_id", departmentId);
  if (deleteError && departmentId !== null) throw deleteError;
  if (departmentId === null) {
    const { error } = await supabase.from("bundle_cache").delete().is("department_id", null);
    if (error) throw error;
  }
  const { error: insertError } = await supabase.from("bundle_cache").insert({
    department_id: departmentId,
    signature,
    storage_path: storagePath,
    doc_count: docs.length,
    size_bytes: zipBytes.byteLength,
    created_by: adminRole.user_id,
  });
  if (insertError) throw insertError;
  return { empty: false, signature, count: docs.length, size: zipBytes.byteLength };
}

async function markJob(id, status, message = null) {
  const { error } = await supabase.from("approved_archive_jobs").update({
    status,
    last_error: message,
    updated_at: new Date().toISOString(),
    finished_at: status === "ready" || status === "failed" ? new Date().toISOString() : null,
  }).eq("id", id);
  if (error) throw error;
}

async function runOnce() {
  const { data: jobs, error } = await supabase.rpc("claim_approved_archive_jobs", { p_limit: 1 });
  if (error) throw error;
  const job = jobs?.[0];
  if (!job) return false;
  console.log(`[archive-worker] processing ${job.scope_key} (attempt ${job.attempts})`);
  try {
    const result = await buildArchive(job);
    await markJob(job.id, "ready");
    console.log(`[archive-worker] ready ${job.scope_key}: ${result.count} documents, ${result.size} bytes`);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    await markJob(job.id, "failed", message.slice(0, 6000));
    console.error(`[archive-worker] failed ${job.scope_key}: ${message}`);
  }
  return true;
}

console.log("[archive-worker] started; polling approved archive queue");
while (true) {
  try {
    const hadJob = await runOnce();
    if (!hadJob) await sleep(POLL_MS);
  } catch (error) {
    console.error("[archive-worker] queue polling error", error);
    await sleep(POLL_MS * 2);
  }
}
