import type { PDFDocument } from "pdf-lib";
import { PDFName, PDFDict, PDFRef, PDFString, PDFHexString } from "pdf-lib";
import type { BookmarkEntry } from "./types";
import { resolveDest } from "./dest";

export function getOutlineItem(
  refOrDict: PDFRef | PDFDict,
  pdfDoc: PDFDocument
): PDFDict {
  return refOrDict instanceof PDFRef
    ? pdfDoc.context.lookup(refOrDict, PDFDict)
    : refOrDict;
}

export function traverseOutlines(
  firstRefOrDict: PDFRef | PDFDict | undefined,
  pdfDoc: PDFDocument,
  pageRefToIndex: Map<string, number>,
  depth: number,
  pathStack: string[],
  startDepth: number,
  endDepth: number,
  out: BookmarkEntry[]
): void {
  if (!firstRefOrDict) return;
  const item = getOutlineItem(firstRefOrDict, pdfDoc);
  const titleObj = item.lookupMaybe(
    PDFName.of("Title"),
    PDFString,
    PDFHexString
  );
  const title = titleObj ? titleObj.decodeText() : "";
  const resolved = resolveDest(item, pdfDoc, pageRefToIndex);
  if (resolved) {
    const inRange =
      depth >= startDepth && (endDepth === 0 || depth <= endDepth);
    if (inRange) {
      const pathNames = [...pathStack.slice(startDepth - 1), title];
      out.push({
        title,
        pageIndex: resolved.pageIndex,
        atTopOfPage: resolved.atTopOfPage,
        depth,
        pathNames,
      });
    }
  }
  const firstVal = item.get(PDFName.of("First"));
  const firstChild =
    firstVal && (firstVal instanceof PDFRef || firstVal instanceof PDFDict)
      ? firstVal
      : undefined;
  if (firstChild) {
    pathStack.push(title);
    traverseOutlines(
      firstChild,
      pdfDoc,
      pageRefToIndex,
      depth + 1,
      pathStack,
      startDepth,
      endDepth,
      out
    );
    pathStack.pop();
  }
  const nextVal = item.get(PDFName.of("Next"));
  const nextRefOrDict =
    nextVal && (nextVal instanceof PDFRef || nextVal instanceof PDFDict)
      ? nextVal
      : undefined;
  if (nextRefOrDict)
    traverseOutlines(
      nextRefOrDict,
      pdfDoc,
      pageRefToIndex,
      depth,
      pathStack,
      startDepth,
      endDepth,
      out
    );
}
