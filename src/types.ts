/** A bookmark entry with resolved page and path for splitting. */
export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  atTopOfPage: boolean;
  depth: number;
  pathNames: string[];
}

/** CLI/split options (defaults match previous hardcoded constants). */
export interface SplitOptions {
  headerFooterMarginRatio: number;
  anchorDistanceRatio: number;
  maxBasenameLength: number;
  indexPadding: number;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  headerFooterMarginRatio: 0.08,
  anchorDistanceRatio: 0.4,
  maxBasenameLength: 200,
  indexPadding: 6,
};
