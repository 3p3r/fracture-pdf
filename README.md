# fracture-pdf

Split PDFs by bookmark (outline) hierarchy and convert each segment to Markdown. Each bookmark becomes a separate PDF and a separate `.md` file. The Markdown is trimmed so each file contains only the section between the current bookmark’s heading and the next, with no overlap.

![Demo Screenshot](demo.png)

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

**Layout** – For each input PDF, the tool creates a folder under the output directory named after the document (filename without `.pdf`). Under that folder:

- **`pdf/`** – One PDF per bookmark segment (pages from that bookmark up to the next).
- **`markdown/`** – One Markdown file per segment: the same pages converted with `@opendocsg/pdf2md`, then trimmed so each file contains only the section between the current heading and the next.

Example for `npx tsx index.ts doc.pdf -s 1 -o out`:

```
out/
  doc/
    pdf/
      000000_Introduction.pdf
      000001_Chapter_One.pdf
      ...
    markdown/
      000000_Introduction.md
      000001_Chapter_One.md
      ...
```

**Filenames** – Each segment’s PDF and Markdown share the same basename. The basename is taken from the **first heading** in the trimmed Markdown (cleaned for filenames and truncated per `--max-basename-length`). The zero-padded index prefix (e.g. `000042_`; configurable with `--index-padding`) keeps directory order aligned with the bookmark hierarchy. If a segment has no heading, the bookmark path is used as fallback.

**Duplicate check** – If any output file (in `pdf/` or `markdown/`) already exists, the tool prints an error and exits with code 1.

**Segment rules**

- If the **next** bookmark is at the **top** of a page, that page is **excluded** from the current PDF.
- If the **next** bookmark is **not** at the top of a page, that page is **included** in the current PDF.
- Bookmarks are processed in **page order** so ranges are correct even when the outline order differs.

## License

MIT
