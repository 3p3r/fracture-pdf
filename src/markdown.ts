import { lexer } from "marked";
import type { Tokens } from "marked";
import { distance } from "fastest-levenshtein";

/**
 * Normalize text for anchor matching: lowercase, alphanumeric only (for Levenshtein comparison).
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

const DEFAULT_MAX_DISTANCE_RATIO = 0.4;

/**
 * Whether the Levenshtein distance is within the allowed threshold (ratio of longer length).
 */
function isWithinThreshold(
  d: number,
  lenA: number,
  lenB: number,
  maxRatio: number,
): boolean {
  const maxLen = Math.max(lenA, lenB, 1);
  return d / maxLen <= maxRatio;
}

function isHeadingToken(t: Tokens.Generic): t is Tokens.Heading {
  return t.type === "heading";
}

/**
 * Find the index of the heading token that best matches the bookmark title (smallest Levenshtein distance),
 * or -1 if no heading is within the distance threshold.
 */
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
    if (
      !isWithinThreshold(
        d,
        normHeading.length,
        normTarget.length,
        maxDistanceRatio,
      )
    )
      continue;
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Trim markdown to the section between the current bookmark's heading and the next bookmark's heading.
 * Uses marked's lexer to find heading tokens, then returns the concatenated .raw of tokens in that range.
 */
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
  if (startIndex < 0) return md;

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

  return tokens
    .slice(startIndex, endIndex)
    .map((t) => t.raw)
    .join("")
    .trimEnd();
}
