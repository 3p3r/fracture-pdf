import createDebug from "debug";
import { lexer } from "marked";
import type { Tokens, TokensList } from "marked";
import { distance } from "fastest-levenshtein";

const debug = createDebug("fracturepdf:markdown");

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

function isHeadingToken(t: Tokens.Generic): t is Tokens.Heading {
  return t.type === "heading";
}

/** Best matching heading index by Levenshtein distance, or -1 if none within threshold. */
function findHeadingIndex(
  tokens: TokensList,
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

/** Trim markdown to the section from the matching heading through the last token before the next heading at the same or higher level. Level is taken from the matched heading in the markdown (outline depth may not match markdown # vs ##). */
export function trimMarkdownToSection(
  md: string,
  currentAnchorTitle: string,
  maxDistanceRatio: number,
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

  const startToken = tokens[startIndex] as Tokens.Heading;
  const startDepth = startToken.depth;

  // End at the next heading that is at the same or higher level (from markdown structure).
  let endIndex = tokens.length;
  for (let i = startIndex + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (isHeadingToken(t) && t.depth <= startDepth) {
      endIndex = i;
      break;
    }
  }

  debug(
    "trimMarkdown: %s (depth=%d) -> tokens [%d,%d)",
    currentAnchorTitle,
    startDepth,
    startIndex,
    endIndex,
  );

  return tokens
    .slice(startIndex, endIndex)
    .map((t) => t.raw)
    .join("")
    .trimEnd();
}

/** First heading token text, or null. */
export function getFirstHeadingText(md: string): string | null {
  const h = lexer(md).find(isHeadingToken);
  return h ? h.text.trim() : null;
}
