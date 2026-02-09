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
}

/** CLI/split options (defaults set by CLI). */
export interface SplitOptions {
  headerFooterMarginRatio: number;
  anchorDistanceRatio: number;
  maxBasenameLength: number;
  indexPadding: number;
  enrich?: EnrichOptions;
}
