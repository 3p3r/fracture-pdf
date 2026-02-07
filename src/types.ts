/** A bookmark entry with resolved page and path for splitting. */
export interface BookmarkEntry {
  title: string;
  pageIndex: number;
  atTopOfPage: boolean;
  depth: number;
  pathNames: string[];
}
