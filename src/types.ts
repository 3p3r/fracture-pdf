/** A bookmark entry with resolved page and path for splitting. */
export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  atTopOfPage: boolean;
  depth: number;
  pathNames: string[];
}

/** Options for LLM metadata/enrichment extraction (optional step at end of pipeline). */
export interface EnrichOptions {
  enabled: boolean;
  model: string;
  baseUrl?: string;
  systemPromptPath: string;
  temperature: number;
  /** Min similarity (0–1) for a ref to be kept; refs not found in markdown below this are dropped. */
  refMatchThreshold: number;
  /** Step when sliding over markdown for fuzzy match (1 = every char, 2 = every other). */
  refMatchStep: number;
  /** Max chars shorter than ref to try when matching substrings. */
  refMatchLenShorter: number;
  /** Max chars longer than ref to try when matching substrings. */
  refMatchLenLonger: number;
}

/** CLI/split options (defaults set by CLI). */
export interface SplitOptions {
  headerFooterMarginRatio: number;
  anchorDistanceRatio: number;
  maxBasenameLength: number;
  indexPadding: number;
  /** "builtin" = @opendocsg/pdf2md; otherwise path to a shell script (input.pdf, output.md). */
  pdfConverter: string;
  enrich?: EnrichOptions;
}
