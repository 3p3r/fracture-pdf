# fracture-pdf

Splits PDFs bookmark to bookmark into Markdown documents.

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

Each bookmark in the chosen depth range becomes one PDF. Filenames are prefixed with a 6-digit zero-padded index (e.g. `000042_Section_Subsection.pdf`) so that a directory listing preserves the same order as the bookmark hierarchy in the original PDF. The rest of the name is built from the bookmark path; long names are truncated to stay within filesystem limits.

- If the **next** bookmark is at the **top** of a page, that page is **excluded** from the current PDF.
- If the **next** bookmark is **not** at the top of a page, that page is **included** in the current PDF.
- Bookmarks are processed in **page order** so ranges are correct even when the outline order differs.

## License

MIT
