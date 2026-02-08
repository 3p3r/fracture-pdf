import { PDFDocument, PDFName, PDFDict, PDFRef } from "pdf-lib";
import * as pdfjs from "pdfjs";
import createDebug from "debug";
import * as fs from "node:fs";
import * as path from "node:path";
import pdf2md from "@opendocsg/pdf2md";
import type { BookmarkEntry, SplitOptions } from "./types";
import { refKey } from "./dest";
import { getOutlineItem, traverseOutlines } from "./outline";
import { sanitizeFilename, safeBasename } from "./filename";
import { getFirstHeadingText, trimMarkdownToSection } from "./markdown";

const debug = createDebug("fracturepdf:split");

function collectBookmarkEntries(
  pdfDoc: PDFDocument,
  startDepth: number,
  endDepth: number,
): BookmarkEntry[] {
  const pages = pdfDoc.getPages();
  const pageRefToIndex = new Map<string, number>();
  for (let i = 0; i < pages.length; i++)
    pageRefToIndex.set(refKey(pages[i].ref), i);

  const outlinesVal = pdfDoc.catalog.get(PDFName.of("Outlines"));
  if (!outlinesVal) return [];

  const outlinesRoot = pdfDoc.context.lookup(outlinesVal, PDFDict);
  const firstVal = outlinesRoot.get(PDFName.of("First"));
  const firstItem =
    firstVal && (firstVal instanceof PDFRef || firstVal instanceof PDFDict)
      ? getOutlineItem(firstVal, pdfDoc)
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
    entries,
  );
  return entries;
}

function sortEntriesByPageOrder(entries: BookmarkEntry[]): void {
  entries.sort(
    (a, b) =>
      a.pageIndex - b.pageIndex ||
      (a.atTopOfPage ? 1 : 0) - (b.atTopOfPage ? 1 : 0),
  );
}

function computeEndPage(
  cur: BookmarkEntry,
  next: BookmarkEntry | undefined,
  pageCount: number,
): number {
  if (!next) return pageCount - 1;
  if (cur.pageIndex === next.pageIndex) return next.pageIndex;
  return next.atTopOfPage ? next.pageIndex - 1 : next.pageIndex;
}

async function getSegmentPdfBuffer(
  buffer: Buffer,
  startPage: number,
  endPage: number,
): Promise<Buffer> {
  const ext = new pdfjs.ExternalDocument(buffer);
  const doc = new pdfjs.Document();
  for (let p = startPage; p <= endPage; p++) doc.addPageOf(p + 1, ext);
  const outBuf = await doc.asBuffer();
  return Buffer.isBuffer(outBuf) ? outBuf : Buffer.from(outBuf as ArrayBuffer);
}

/**
 * Crops each page's CropBox to exclude top and bottom bands (header/footer)
 * so pdf2md does not include that content.
 */
async function cropPdfHeaderFooter(
  pdfBuffer: Buffer,
  marginRatio: number,
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

async function convertSegmentToMarkdownAndName(
  segmentPdfBuffer: Buffer,
  index: number,
  currentTitle: string,
  nextTitle: string | null,
  bookmarkBaseName: string,
  opts: SplitOptions,
): Promise<{ trimmed: string; baseName: string }> {
  const cropped = await cropPdfHeaderFooter(
    segmentPdfBuffer,
    opts.headerFooterMarginRatio,
  );
  const rawMd = await pdf2md(cropped, {});
  const trimmed = trimMarkdownToSection(
    rawMd,
    currentTitle,
    nextTitle,
    opts.anchorDistanceRatio,
  );

  const firstHeadingText = getFirstHeadingText(trimmed);
  const baseName =
    firstHeadingText !== null
      ? safeBasename(
          [sanitizeFilename(firstHeadingText)],
          firstHeadingText,
          index,
          opts.maxBasenameLength,
        )
      : bookmarkBaseName;
  return { trimmed, baseName };
}

export async function splitPdfByBookmarks(
  buffer: Buffer,
  startDepth: number,
  endDepth: number,
  outDir: string,
  baseName: string,
  opts: SplitOptions,
): Promise<void> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(buffer), {
    ignoreEncryption: true,
  });
  const pageCount = pdfDoc.getPages().length;
  debug("loaded %s: %d pages", baseName, pageCount);

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
  debug("%s: %d bookmarks in range", baseName, entries.length);
  sortEntriesByPageOrder(entries);

  const pdfDir = path.join(outDir, "pdf");
  const mdDir = path.join(outDir, "markdown");
  fs.mkdirSync(pdfDir, { recursive: true });
  fs.mkdirSync(mdDir, { recursive: true });

  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i];
    const next = entries[i + 1];
    const endPage = computeEndPage(cur, next, pageCount);
    if (cur.pageIndex > endPage) continue;

    const bookmarkBaseName = safeBasename(
      cur.pathNames.map(sanitizeFilename),
      cur.title,
      i,
      opts.maxBasenameLength,
    );
    const segmentBuffer = await getSegmentPdfBuffer(
      buffer,
      cur.pageIndex,
      endPage,
    );
    const { trimmed, baseName } = await convertSegmentToMarkdownAndName(
      segmentBuffer,
      i,
      cur.title,
      next?.title ?? null,
      bookmarkBaseName,
      opts,
    );
    const name = `${String(i).padStart(opts.indexPadding, "0")}_${baseName}`;
    const pdfPath = path.join(pdfDir, `${name}.pdf`);
    const mdPath = path.join(mdDir, `${name}.md`);
    debug(
      "%s segment %d: %s (pages %d–%d)",
      baseName,
      i,
      name,
      cur.pageIndex,
      endPage,
    );

    const existing = [pdfPath, mdPath].find((p) => fs.existsSync(p));
    if (existing) {
      console.error(`fracture-pdf: output file already exists: ${existing}`);
      process.exit(1);
    }

    fs.writeFileSync(pdfPath, segmentBuffer);
    fs.writeFileSync(mdPath, trimmed, "utf-8");
  }
}
