import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFImage, type PDFFont } from "pdf-lib";
import { renderAsync } from "docx-preview";
import { toPng } from "html-to-image";
import hodStampUrl from "@/assets/hod-stamp.png";
import iqaStampUrl from "@/assets/iqa-stamp.png";

export type StampInput = {
  role: "hod" | "iqa";
  approverName?: string | null;
  date?: string | null;
};

const BLUE = rgb(0.12, 0.23, 0.54);
const PURPLE = rgb(0.43, 0.18, 0.57);
const A4: [number, number] = [595, 842];

const STAMP_URL: Record<StampInput["role"], string> = {
  hod: hodStampUrl,
  iqa: iqaStampUrl,
};

async function loadStampImage(pdf: PDFDocument, role: StampInput["role"]): Promise<PDFImage> {
  const res = await fetch(STAMP_URL[role]);
  const bytes = await res.arrayBuffer();
  return pdf.embedPng(bytes);
}

function currentStampDate() {
  return new Date().toLocaleDateString();
}

/**
 * Render a .docx buffer visually into `pdf`. If `reservedBottomOnLastPage`
 * is > 0, the last page is extended with that much extra empty space at the
 * bottom so stamps can be drawn immediately below the document content.
 */
async function renderDocxIntoPdf(
  pdf: PDFDocument,
  buffer: ArrayBuffer,
  reservedBottomOnLastPage = 0,
) {
  if (typeof document === "undefined") {
    throw new Error("DOCX rendering is only available in the browser");
  }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "820px";
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  try {
    await renderAsync(buffer, host, undefined, {
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      useBase64URL: true,
      experimental: true,
    });

    const sections = Array.from(host.querySelectorAll("section.docx")) as HTMLElement[];
    const targets = sections.length > 0 ? sections : [host];

    for (let i = 0; i < targets.length; i++) {
      const section = targets[i];
      const isLast = i === targets.length - 1;
      const rect = section.getBoundingClientRect();
      const dataUrl = await toPng(section, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
        width: rect.width,
        height: rect.height,
        skipFonts: false,
      });
      const pngBytes = await (await fetch(dataUrl)).arrayBuffer();
      const img = await pdf.embedPng(pngBytes);
      const ratio = img.height / img.width;
      const pageWidth = A4[0];
      const imgHeight = pageWidth * ratio;
      const extra = isLast ? reservedBottomOnLastPage : 0;
      const pageHeight = imgHeight + extra;
      const page = pdf.addPage([pageWidth, pageHeight]);
      // pdf-lib y-origin is the bottom of the page — image sits above reserved space.
      page.drawImage(img, { x: 0, y: extra, width: pageWidth, height: imgHeight });
    }
  } finally {
    host.remove();
  }
}

function drawStamp(
  page: PDFPage,
  image: PDFImage,
  fontReg: PDFFont,
  stamp: StampInput,
  x: number,
  y: number,
  width: number,
) {
  const scale = width / image.width;
  const height = image.height * scale;
  const dateLine = `DATE: ${currentStampDate()}: APPROVED`;
  page.drawImage(image, { x, y: y + 18, width, height });

  const stampColor = stamp.role === "hod" ? PURPLE : BLUE;
  const dateSize = stamp.role === "hod" ? 9 : 8;
  const dateWidth = fontReg.widthOfTextAtSize(dateLine, dateSize);
  const dateY = stamp.role === "hod" ? y + 18 + height * 0.2 : y + 4;
  page.drawText(dateLine, {
    x: x + (width - dateWidth) / 2,
    y: dateY,
    size: dateSize,
    font: fontReg,
    color: stampColor,
  });

  // Verifier names are intentionally NOT printed on the stamp.
  return height + 34;
}

export async function buildStampedPdf(opts: {
  title: string;
  meta: Record<string, string | null | undefined>;
  fileUrl: string | null;
  fileName?: string | null;
  stamps: StampInput[];
}): Promise<Uint8Array> {
  let pdf: PDFDocument;
  let hasOriginalContent = false;
  let isDocxRender = false;
  let docxBuffer: ArrayBuffer | null = null;

  if (opts.fileUrl) {
    const lowerFileName = (opts.fileName || "").toLowerCase();
    const expectsOriginalDocument = /\.(pdf|docx|docm)$/.test(lowerFileName);
    try {
      const res = await fetch(opts.fileUrl);
      if (!res.ok) throw new Error("Could not load the original attachment");
      const buf = await res.arrayBuffer();
      const ct = res.headers.get("content-type") || "";
      const looksPdf = ct.includes("pdf") || lowerFileName.endsWith(".pdf");
      const looksDocx =
        ct.includes("wordprocessingml") ||
        lowerFileName.endsWith(".docx") ||
        lowerFileName.endsWith(".docm");

      if (looksPdf) {
        pdf = await PDFDocument.load(buf);
        hasOriginalContent = true;
      } else if (looksDocx) {
        pdf = await PDFDocument.create();
        isDocxRender = true;
        docxBuffer = buf;
        hasOriginalContent = true;
      } else {
        pdf = await PDFDocument.create();
      }
    } catch (err) {
      console.error("[stamped-pdf] failed to load original", err);
      if (expectsOriginalDocument) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Could not stamp the original document: ${detail}`);
      }
      pdf = await PDFDocument.create();
    }
  } else {
    pdf = await PDFDocument.create();
  }

  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);

  // Preload stamp images first so we can compute the stamp block height
  // and reserve room at the bottom of the last content page.
  const uniqueRoles = Array.from(new Set(opts.stamps.map((s) => s.role)));
  const images: Partial<Record<StampInput["role"], PDFImage>> = {};
  for (const role of uniqueRoles) {
    images[role] = await loadStampImage(pdf, role);
  }

  const margin = 30;
  const stampW = 200;
  const gap = 24;
  // Tallest stamp determines reserved band height. drawStamp draws image at
  // (y + 18) with height = image.height * stampW/image.width, plus ~34pt of
  // label padding above/below.
  const maxStampImgHeight = opts.stamps.reduce((max, s) => {
    const img = images[s.role];
    if (!img) return max;
    const h = img.height * (stampW / img.width);
    return Math.max(max, h);
  }, 0);
  const stampBlockHeight = maxStampImgHeight + 40; // label + padding
  const reservedBottom = opts.stamps.length > 0 ? stampBlockHeight + margin * 2 : 0;

  // Render DOCX now that we know how much bottom space to reserve on the last page.
  if (isDocxRender && docxBuffer) {
    await renderDocxIntoPdf(pdf, docxBuffer, reservedBottom);
  }

  if (!hasOriginalContent) {
    const page = pdf.addPage(A4);
    let y = 800;
    page.drawText("WTTI — Approved Document Record", { x: 40, y, size: 16, font: fontBold, color: BLUE });
    y -= 28;
    page.drawText(opts.title, { x: 40, y, size: 13, font: fontBold, color: rgb(0, 0, 0) });
    y -= 24;
    for (const [k, v] of Object.entries(opts.meta)) {
      if (!v) continue;
      page.drawText(`${k}:`, { x: 40, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(String(v), { x: 130, y, size: 10, font: fontReg, color: rgb(0, 0, 0) });
      y -= 16;
    }
    if (opts.fileName) {
      y -= 8;
      page.drawText(`Original attachment: ${opts.fileName}`, { x: 40, y, size: 9, font: fontReg, color: rgb(0.4, 0.4, 0.4) });
    }
  }

  if (opts.stamps.length === 0) {
    return pdf.save();
  }

  // Place stamps directly on the last content page, immediately below the
  // document content. For DOCX we reserved space above; for PDF originals we
  // draw at the bottom margin of the last page (which the user accepts when
  // the document occupies the full page).
  const pages = pdf.getPages();
  const stampPage = pages[pages.length - 1];
  const { width, height: pageHeight } = stampPage.getSize();

  let bandBottom = 0;
  if (!isDocxRender && hasOriginalContent) {
    // Grow the existing last page downwards instead of adding a new page, so the
    // stamps sit immediately after the document content without covering it.
    const box = stampPage.getMediaBox();
    stampPage.setMediaBox(box.x, box.y - reservedBottom, box.width, box.height + reservedBottom);
    try {
      stampPage.setCropBox(box.x, box.y - reservedBottom, box.width, box.height + reservedBottom);
    } catch { /* crop box optional */ }
    bandBottom = box.y - reservedBottom;
  }
  void pageHeight;

  const totalW = opts.stamps.length * stampW + Math.max(0, opts.stamps.length - 1) * gap;
  const startX = Math.max(margin, (width - totalW) / 2);
  const y = bandBottom + margin;

  for (let i = 0; i < opts.stamps.length; i++) {
    const x = startX + i * (stampW + gap);
    if (x + stampW > width - margin) break;
    const img = images[opts.stamps[i].role];
    if (!img) continue;
    drawStamp(stampPage, img, fontReg, opts.stamps[i], x, y, stampW);
  }

  return pdf.save();
}
