#!/usr/bin/env node
import { Command } from "commander";
import createDebug from "debug";
import * as fs from "node:fs";
import * as path from "node:path";
import { splitPdfByBookmarks } from "./src/split";
import type { SplitOptions } from "./src/types";

const debug = createDebug("fracturepdf:cli");
const program = new Command();

program
  .name("fracture-pdf")
  .description("Split PDFs by bookmark hierarchy")
  .argument("[files...]", "PDF file(s) to split (omit when using --input)")
  .option(
    "-i, --input <path>",
    "JSON file listing inputs with optional per-file start/end (overrides -s/-e per entry)",
  )
  .option(
    "-s, --start <depth>",
    "bookmark depth to start splitting from (1-indexed); default when using --input",
    (v) => parseInt(v, 10),
    1,
  )
  .option(
    "-e, --end <depth>",
    "bookmark depth to end at (0 = deepest)",
    (v) => parseInt(v, 10),
    0,
  )
  .option("-o, --output <dir>", "output directory", ".")
  .option(
    "--header-footer-margin <ratio>",
    "fraction of page height to crop from top/bottom for header/footer exclusion (0–0.5)",
    (v) => parseFloat(v),
    0.08,
  )
  .option(
    "--anchor-distance-ratio <ratio>",
    "max Levenshtein distance ratio for matching bookmark to heading (0–1)",
    (v) => parseFloat(v),
    0.4,
  )
  .option(
    "--max-basename-length <n>",
    "max length of output basename before truncation",
    (v) => parseInt(v, 10),
    200,
  )
  .option(
    "--index-padding <n>",
    "number of digits for zero-padded segment index in filenames",
    (v) => parseInt(v, 10),
    6,
  )
  .action(run);

program.parse();

interface InputEntry {
  file: string;
  start?: number;
  end?: number;
}

async function run(
  files: string[],
  opts: Record<string, unknown>,
): Promise<void> {
  const outDir = path.resolve((opts.output as string) ?? ".");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const splitOpts: SplitOptions = {
    headerFooterMarginRatio: opts.headerFooterMargin as number,
    anchorDistanceRatio: opts.anchorDistanceRatio as number,
    maxBasenameLength: opts.maxBasenameLength as number,
    indexPadding: opts.indexPadding as number,
  };

  const defaultStart = (opts.start as number) ?? 1;
  const defaultEnd = (opts.end as number) ?? 0;

  let entries: { resolvedPath: string; start: number; end: number }[];

  if (opts.input) {
    const inputPath = path.resolve(opts.input as string);
    if (!fs.existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as unknown;
    if (!Array.isArray(raw)) {
      console.error("Input JSON must be an array of { file, start?, end? }");
      process.exit(1);
    }
    entries = raw.map((item: unknown, i: number) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("file" in item) ||
        typeof (item as InputEntry).file !== "string"
      ) {
        console.error(`Input entry ${i}: must have "file" (string)`);
        process.exit(1);
      }
      const e = item as InputEntry;
      return {
        resolvedPath: path.resolve(e.file),
        start: e.start ?? defaultStart,
        end: e.end ?? defaultEnd,
      };
    });
  } else {
    if (!files?.length) {
      console.error("Provide PDF file(s) as arguments, or use --input <json>");
      program.help({ error: true });
    }
    entries = files.map((file) => ({
      resolvedPath: path.resolve(file),
      start: defaultStart,
      end: defaultEnd,
    }));
  }

  debug("run entries=%d outDir=%s", entries.length, outDir);

  for (const { resolvedPath, start, end } of entries) {
    debug("processing %s (start=%d end=%d)", resolvedPath, start, end);
    const docName = path.basename(resolvedPath, ".pdf");
    const docOutDir = path.join(outDir, docName);
    await processOneFile(resolvedPath, start, end, docOutDir, splitOpts);
  }
}

async function processOneFile(
  resolvedPath: string,
  startDepth: number,
  endDepth: number,
  docOutDir: string,
  splitOpts: SplitOptions,
): Promise<void> {
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }
  try {
    await splitPdfByBookmarks(
      fs.readFileSync(resolvedPath),
      startDepth,
      endDepth,
      docOutDir,
      path.basename(resolvedPath, ".pdf"),
      splitOpts,
    );
    debug("done %s", resolvedPath);
  } catch (err) {
    console.error(`Error processing ${resolvedPath}:`, err);
    process.exitCode = 1;
  }
}
