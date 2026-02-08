import type { PDFDocument } from "pdf-lib";
import {
  PDFName,
  PDFDict,
  PDFRef,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFNumber,
} from "pdf-lib";

export function refKey(ref: PDFRef): string {
  return `${ref.objectNumber},${ref.generationNumber}`;
}

export function getPageHeight(pdfDoc: PDFDocument, pageIndex: number): number {
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  const mediaBox = page.node.MediaBox();
  const lly = mediaBox.lookup(1, PDFNumber).asNumber();
  const ury = mediaBox.lookup(3, PDFNumber).asNumber();
  return ury - lly;
}

function getDestTop(dest: PDFArray): number | null {
  if (dest.size() < 2) return null;
  const typeObj = dest.lookupMaybe(1, PDFName);
  if (!typeObj) return null;
  const name = typeObj.decodeText();
  if (name === "XYZ" && dest.size() >= 5) {
    const top = dest.lookupMaybe(3, PDFNumber);
    return top ? top.asNumber() : null;
  }
  if (name === "FitH" && dest.size() >= 3) {
    const top = dest.lookupMaybe(2, PDFNumber);
    return top ? top.asNumber() : null;
  }
  return null;
}

export function findInNameTree(
  name: string,
  nodeRefOrDict: PDFRef | PDFDict,
  pdfDoc: PDFDocument,
): PDFArray | undefined {
  const node =
    nodeRefOrDict instanceof PDFRef
      ? pdfDoc.context.lookup(nodeRefOrDict, PDFDict)
      : nodeRefOrDict;
  const namesVal = node.get(PDFName.of("Names"));
  if (namesVal) {
    const arr = pdfDoc.context.lookup(namesVal, PDFArray);
    for (let i = 0; i < arr.size() - 1; i += 2) {
      const keyObj = pdfDoc.context.lookup(arr.get(i));
      const keyStr =
        keyObj instanceof PDFString || keyObj instanceof PDFHexString
          ? keyObj.decodeText()
          : keyObj instanceof PDFName
            ? keyObj.decodeText()
            : null;
      if (keyStr === name) {
        const val = pdfDoc.context.lookup(arr.get(i + 1));
        if (val instanceof PDFArray) return val;
        if (val instanceof PDFDict) {
          const d = val.get(PDFName.of("D"));
          if (d) {
            const resolved = pdfDoc.context.lookup(d);
            if (resolved instanceof PDFArray) return resolved;
          }
        }
        return undefined;
      }
    }
  }
  const kidsVal = node.get(PDFName.of("Kids"));
  if (kidsVal) {
    const kids = pdfDoc.context.lookup(kidsVal, PDFArray);
    for (let j = 0; j < kids.size(); j++) {
      const found = findInNameTree(name, kids.get(j) as PDFRef, pdfDoc);
      if (found) return found;
    }
  }
  return undefined;
}

export function resolveNamedDest(
  name: string,
  pdfDoc: PDFDocument,
): PDFArray | undefined {
  const destsVal = pdfDoc.catalog.get(PDFName.of("Dests"));
  if (destsVal) {
    const destsDict = pdfDoc.context.lookup(destsVal, PDFDict);
    const entry = destsDict.get(PDFName.of(name));
    if (entry) {
      const resolved = pdfDoc.context.lookup(entry);
      if (resolved instanceof PDFArray) return resolved;
    }
  }
  const namesVal = pdfDoc.catalog.get(PDFName.of("Names"));
  if (!namesVal) return undefined;
  const namesDict = pdfDoc.context.lookup(namesVal, PDFDict);
  const destsTreeVal = namesDict.get(PDFName.of("Dests"));
  if (!destsTreeVal) return undefined;
  return findInNameTree(name, destsTreeVal, pdfDoc);
}

export function resolveDest(
  item: PDFDict,
  pdfDoc: PDFDocument,
  pageRefToIndex: Map<string, number>,
): { pageIndex: number; atTopOfPage: boolean } | null {
  let dest: PDFArray | undefined;
  const destVal = item.get(PDFName.of("Dest"));
  if (destVal) {
    const resolved = pdfDoc.context.lookup(destVal);
    if (resolved instanceof PDFArray) dest = resolved;
    else if (resolved instanceof PDFName)
      dest = resolveNamedDest(resolved.decodeText(), pdfDoc);
    else if (resolved instanceof PDFString || resolved instanceof PDFHexString)
      dest = resolveNamedDest(resolved.decodeText(), pdfDoc);
  }
  if (!dest) {
    const a = item.lookupMaybe(PDFName.of("A"), PDFDict);
    if (a) {
      const s = a.lookupMaybe(PDFName.of("S"), PDFName);
      if (s && s.decodeText() === "GoTo") {
        const d = a.get(PDFName.of("D"));
        if (d) {
          const resolved = pdfDoc.context.lookup(d);
          if (resolved instanceof PDFArray) dest = resolved;
          else if (resolved instanceof PDFName)
            dest = resolveNamedDest(resolved.decodeText(), pdfDoc);
        }
      }
    }
  }
  if (!dest || dest.size() < 1) return null;
  const firstElem = dest.get(0);
  let pageIndex: number | undefined;
  if (firstElem instanceof PDFRef) {
    pageIndex = pageRefToIndex.get(refKey(firstElem));
  } else {
    const resolved = pdfDoc.context.lookup(firstElem);
    const pages = pdfDoc.getPages();
    pageIndex = pages.findIndex((p) => p.node === resolved);
  }
  if (pageIndex === undefined || pageIndex < 0) return null;
  const top = getDestTop(dest);
  const pageHeight = getPageHeight(pdfDoc, pageIndex);
  const atTopOfPage = top === null || top >= pageHeight - 5;
  return { pageIndex, atTopOfPage };
}
