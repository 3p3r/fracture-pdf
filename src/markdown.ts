import createDebug from "debug";
import { lexer } from "marked";
import type { Tokens } from "marked";
import { distance } from "fastest-levenshtein";

const debug = createDebug("fracturepdf:markdown");

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

const DEFAULT_MAX_DISTANCE_RATIO = 0.4;

function isHeadingToken(t: Tokens.Generic): t is Tokens.Heading {
  return t.type === "heading";
}

/** Best matching heading index by Levenshtein distance, or -1 if none within threshold. */
function findHeadingIndex(
  tokens: Tokens.TokensList,
  bookmarkTitle: string,
  fromIndex: number,
  maxDistanceRatio: number,
): number {
  const normTarget = normalizeForMatch(bookmarkTitle);
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = fromIndex; i < tokens.length; i++) {
    const t = tokens[i];
    if (!isHeadingToken(t)) continue;
    const normHeading = normalizeForMatch(t.text);
    const d = distance(normHeading, normTarget);
    const maxLen = Math.max(normHeading.length, normTarget.length, 1);
    if (d / maxLen > maxDistanceRatio) continue;
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Trim markdown to the section between the current and next bookmark headings (by matched heading tokens). */
export function trimMarkdownToSection(
  md: string,
  currentAnchorTitle: string,
  nextAnchorTitle: string | null,
  maxDistanceRatio: number = DEFAULT_MAX_DISTANCE_RATIO,
): string {
  const tokens = lexer(md);
  const startIndex = findHeadingIndex(
    tokens,
    currentAnchorTitle,
    0,
    maxDistanceRatio,
  );
  if (startIndex < 0) {
    debug("trimMarkdown: no heading match for %s", currentAnchorTitle);
    return md;
  }

  let endIndex = tokens.length;
  if (nextAnchorTitle) {
    const nextIndex = findHeadingIndex(
      tokens,
      nextAnchorTitle,
      startIndex + 1,
      maxDistanceRatio,
    );
    if (nextIndex >= 0) endIndex = nextIndex;
  }
  debug("trimMarkdown: %s -> tokens [%d,%d)", currentAnchorTitle, startIndex, endIndex);

  return tokens
    .slice(startIndex, endIndex)
    .map((t) => t.raw)
    .join("")
    .trimEnd();
}
