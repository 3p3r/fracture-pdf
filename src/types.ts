/** A bookmark entry with resolved page and path for splitting. */
export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  atTopOfPage: boolean;
  depth: number;
  pathNames: string[];
}

/** CLI/split options (defaults set by CLI). */
export interface SplitOptions {
  headerFooterMarginRatio: number;
  anchorDistanceRatio: number;
  maxBasenameLength: number;
  indexPadding: number;
}
