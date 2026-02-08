# fracture-pdf

Split PDFs by bookmark (outline) hierarchy and convert each segment to Markdown. Each bookmark becomes a separate PDF and a separate `.md` file. The Markdown is trimmed so each file contains only the section between the current bookmark’s heading and the next, with no overlap.

## Installation

```bash
npm install
```

## Usage

```bash
npx tsx index.ts <files...> --start <depth> [--end <depth>] [--output <dir>]
```

Or with the start script:

```bash
npm start -- <files...> -s <depth> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `files`  | One or more PDF file paths to split |

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--start` | `-s` | Bookmark depth to start splitting from (1-indexed; 1 = top-level) | *required* |
| `--end`   | `-e` | Bookmark depth to end at (0 = deepest level) | `0` |
| `--output`| `-o` | Output directory for split PDFs | `.` |
| `--header-footer-margin <ratio>` | — | Fraction of page height to crop from top/bottom (header/footer exclusion) | `0.08` |
| `--anchor-distance-ratio <ratio>` | — | Max Levenshtein distance ratio for matching bookmark to heading | `0.4` |
| `--max-basename-length <n>` | — | Max length of output basename before truncation | `200` |
| `--index-padding <n>` | — | Number of digits for zero-padded segment index in filenames | `6` |
| `--help`  | `-h` | Show help | — |

### Examples

Split a single PDF from depth 2 down to the deepest bookmark, writing into `./out`:

```bash
npx tsx index.ts document.pdf -s 2 -o out
```

Split from the first bookmark level (depth 1) through depth 3 only:

```bash
npx tsx index.ts document.pdf -s 1 -e 3 -o ./splits
```

Process multiple files:

```bash
npx tsx index.ts part1.pdf part2.pdf -s 2 -o ./chapters
```

### Output

For each bookmark in the chosen depth range the tool writes:

- **PDF** – Pages from that bookmark up to the next (same as before).
- **Markdown** – The same segment converted to Markdown with `@opendocsg/pdf2md`, then trimmed: everything before the current section heading is removed, and everything from the next section heading onward is removed, so each `.md` file contains only that section.

Filenames are prefixed with a zero-padded index (default 6 digits, e.g. `000042_Section_Subsection.pdf` and `.md`; configurable with `--index-padding`) so that a directory listing preserves the same order as the bookmark hierarchy. The rest of the name is built from the bookmark path; long names are truncated (see `--max-basename-length`).

- If the **next** bookmark is at the **top** of a page, that page is **excluded** from the current PDF.
- If the **next** bookmark is **not** at the top of a page, that page is **included** in the current PDF.
- Bookmarks are processed in **page order** so ranges are correct even when the outline order differs.

## License

MIT
