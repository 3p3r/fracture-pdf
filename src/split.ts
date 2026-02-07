import { PDFDocument, PDFName, PDFDict, PDFRef } from "pdf-lib";
import * as pdfjs from "pdfjs";
import * as fs from "fs";
import * as path from "path";
import type { BookmarkEntry } from "./types";
import { refKey } from "./dest";
import { traverseOutlines } from "./outline";
import { sanitizeFilename, safeBasename } from "./filename";

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

function writeSegment(
  buffer: Buffer,
  startPage: number,
  endPage: number,
  outPath: string
): Promise<void> {
  const ext = new pdfjs.ExternalDocument(buffer);
  const doc = new pdfjs.Document();
  for (let p = startPage; p <= endPage; p++) doc.addPageOf(p + 1, ext);
  return doc.asBuffer().then((outBuf) => fs.writeFileSync(outPath, outBuf));
}

export async function splitPdfByBookmarks(
  buffer: Buffer,
  startDepth: number,
  endDepth: number,
  outDir: string,
  baseName: string
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
      i
    );
    const name = `${String(i).padStart(6, "0")}_${baseName}`;
    const outPath = path.join(outDir, `${name}.pdf`);
    await writeSegment(buffer, cur.pageIndex, endPage, outPath);
  }
}
