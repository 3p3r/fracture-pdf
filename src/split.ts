import { PDFDocument, PDFName, PDFDict, PDFRef } from "pdf-lib";
import * as pdfjs from "pdfjs";
import * as fs from "fs";
import * as path from "path";
import pdf2md from "@opendocsg/pdf2md";
import type { BookmarkEntry, SplitOptions } from "./types";
import { DEFAULT_SPLIT_OPTIONS } from "./types";
import { refKey } from "./dest";
import { traverseOutlines } from "./outline";
import { sanitizeFilename, safeBasename } from "./filename";
import { trimMarkdownToSection } from "./markdown";

function collectBookmarkEntries(
  pdfDoc: PDFDocument,
  startDepth: number,
  endDepth: number
): BookmarkEntry[] {
  const pages = pdfDoc.getPages();
  const pageRefToIndex = new Map<string, number>();
  pages.forEach((p, i) => pageRefToIndex.set(refKey(p.ref), i));

  const outlinesVal = pdfDoc.catalog.get(PDFName.of("Outlines"));
  if (!outlinesVal) return [];

  const outlinesRoot = pdfDoc.context.lookup(outlinesVal, PDFDict);
  const firstVal = outlinesRoot.get(PDFName.of("First"));
  const firstItem = firstVal
    ? firstVal instanceof PDFRef
      ? pdfDoc.context.lookup(firstVal, PDFDict)
      : (firstVal as PDFDict)
    : undefined;

  const entries: BookmarkEntry[] = [];
  traverseOutlines(
    firstItem,
    pdfDoc,
    pageRefToIndex,
    1,
    [],
    startDepth,
    endDepth,
    entries
  );
  return entries;
}

function sortEntriesByPageOrder(entries: BookmarkEntry[]): void {
  entries.sort((a, b) =>
    a.pageIndex !== b.pageIndex
      ? a.pageIndex - b.pageIndex
      : a.atTopOfPage === b.atTopOfPage
        ? 0
        : a.atTopOfPage
          ? 1
          : -1
  );
}

function computeEndPage(
  cur: BookmarkEntry,
  next: BookmarkEntry | undefined,
  pageCount: number
): number {
  if (!next) return pageCount - 1;
  if (cur.pageIndex === next.pageIndex) return next.pageIndex;
  return next.atTopOfPage ? next.pageIndex - 1 : next.pageIndex;
}

async function writeSegmentPdf(
  buffer: Buffer,
  startPage: number,
  endPage: number,
  outPath: string
): Promise<Buffer> {
  const ext = new pdfjs.ExternalDocument(buffer);
  const doc = new pdfjs.Document();
  for (let p = startPage; p <= endPage; p++) doc.addPageOf(p + 1, ext);
  const outBuf = await doc.asBuffer();
  const nodeBuffer = Buffer.isBuffer(outBuf) ? outBuf : Buffer.from(outBuf as ArrayBuffer);
  fs.writeFileSync(outPath, nodeBuffer);
  return nodeBuffer;
}

/**
 * Crops each page's CropBox to exclude top and bottom bands (header/footer)
 * so pdf2md does not include that content.
 */
async function cropPdfHeaderFooter(
  pdfBuffer: Buffer,
  marginRatio: number
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer), {
    ignoreEncryption: true,
  });
  for (const page of pdfDoc.getPages()) {
    const { x, y, width, height } = page.getCropBox();
    const newY = y + height * marginRatio;
    const newHeight = height * (1 - 2 * marginRatio);
    if (newHeight > 0) {
      page.setCropBox(x, newY, width, newHeight);
    }
  }
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function convertSegmentToMarkdown(
  segmentPdfBuffer: Buffer,
  mdPath: string,
  currentTitle: string,
  nextTitle: string | null,
  opts: Pick<SplitOptions, "headerFooterMarginRatio" | "anchorDistanceRatio">
): Promise<void> {
  const cropped = await cropPdfHeaderFooter(
    segmentPdfBuffer,
    opts.headerFooterMarginRatio
  );
  const rawMd = await pdf2md(cropped, {});
  const trimmed = trimMarkdownToSection(
    rawMd,
    currentTitle,
    nextTitle,
    opts.anchorDistanceRatio
  );
  fs.writeFileSync(mdPath, trimmed, "utf-8");
}

export async function splitPdfByBookmarks(
  buffer: Buffer,
  startDepth: number,
  endDepth: number,
  outDir: string,
  baseName: string,
  opts: SplitOptions = DEFAULT_SPLIT_OPTIONS
): Promise<void> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(buffer), {
    ignoreEncryption: true,
  });
  const pageCount = pdfDoc.getPages().length;

  const hasOutlines = pdfDoc.catalog.get(PDFName.of("Outlines"));
  if (!hasOutlines) {
    console.warn(`No outlines in ${baseName}.pdf, skipping.`);
    return;
  }

  const entries = collectBookmarkEntries(pdfDoc, startDepth, endDepth);
  if (entries.length === 0) {
    console.warn(`No bookmarks in depth range for ${baseName}.pdf, skipping.`);
    return;
  }

  sortEntriesByPageOrder(entries);

  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i];
    const next = entries[i + 1];
    const endPage = computeEndPage(cur, next, pageCount);
    if (cur.pageIndex > endPage) continue;

    const baseName = safeBasename(
      cur.pathNames.map(sanitizeFilename),
      cur.title,
      i,
      opts.maxBasenameLength
    );
    const name = `${String(i).padStart(opts.indexPadding, "0")}_${baseName}`;
    const pdfPath = path.join(outDir, `${name}.pdf`);
    const segmentBuffer = await writeSegmentPdf(
      buffer,
      cur.pageIndex,
      endPage,
      pdfPath
    );
    const mdPath = path.join(outDir, `${name}.md`);
    await convertSegmentToMarkdown(
      segmentBuffer,
      mdPath,
      cur.title,
      next?.title ?? null,
      opts
    );
  }
}
