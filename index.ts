#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { splitPdfByBookmarks } from "./src/split";
import { DEFAULT_SPLIT_OPTIONS, type SplitOptions } from "./src/types";

const program = new Command();

program
  .name("fracture-pdf")
  .description("Split PDFs by bookmark hierarchy")
  .argument("<files...>", "PDF file(s) to split")
  .requiredOption(
    "-s, --start <depth>",
    "bookmark depth to start splitting from (1-indexed)",
    (v) => parseInt(v, 10),
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
    DEFAULT_SPLIT_OPTIONS.headerFooterMarginRatio,
  )
  .option(
    "--anchor-distance-ratio <ratio>",
    "max Levenshtein distance ratio for matching bookmark to heading (0–1)",
    (v) => parseFloat(v),
    DEFAULT_SPLIT_OPTIONS.anchorDistanceRatio,
  )
  .option(
    "--max-basename-length <n>",
    "max length of output basename before truncation",
    (v) => parseInt(v, 10),
    DEFAULT_SPLIT_OPTIONS.maxBasenameLength,
  )
  .option(
    "--index-padding <n>",
    "number of digits for zero-padded segment index in filenames",
    (v) => parseInt(v, 10),
    DEFAULT_SPLIT_OPTIONS.indexPadding,
  )
  .action(run);

program.parse();

async function run(
  files: string[],
  opts: Record<string, unknown>,
): Promise<void> {
  const outDir = path.resolve((opts.output as string) ?? ".");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const splitOpts: SplitOptions = {
    ...DEFAULT_SPLIT_OPTIONS,
    headerFooterMarginRatio:
      (opts.headerFooterMargin as number) ??
      DEFAULT_SPLIT_OPTIONS.headerFooterMarginRatio,
    anchorDistanceRatio:
      (opts.anchorDistanceRatio as number) ??
      DEFAULT_SPLIT_OPTIONS.anchorDistanceRatio,
    maxBasenameLength:
      (opts.maxBasenameLength as number) ??
      DEFAULT_SPLIT_OPTIONS.maxBasenameLength,
    indexPadding:
      (opts.indexPadding as number) ?? DEFAULT_SPLIT_OPTIONS.indexPadding,
  };

  for (const file of files) {
    await processOneFile(
      file,
      opts.start as number,
      opts.end as number,
      outDir,
      splitOpts,
    );
  }
}

async function processOneFile(
  file: string,
  startDepth: number,
  endDepth: number,
  outDir: string,
  splitOpts: SplitOptions,
): Promise<void> {
  const resolvedPath = path.resolve(file);
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
      outDir,
      path.basename(resolvedPath, ".pdf"),
      splitOpts,
    );
  } catch (err) {
    console.error(`Error processing ${resolvedPath}:`, err);
    process.exitCode = 1;
  }
}
