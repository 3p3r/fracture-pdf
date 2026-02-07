#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { splitPdfByBookmarks } from "./src/split";

const program = new Command();

program
  .name("fracture-pdf")
  .description("Split PDFs by bookmark hierarchy")
  .argument("<files...>", "PDF file(s) to split")
  .requiredOption(
    "-s, --start <depth>",
    "bookmark depth to start splitting from (1-indexed)",
    (v) => parseInt(v, 10)
  )
  .option(
    "-e, --end <depth>",
    "bookmark depth to end at (0 = deepest)",
    (v) => parseInt(v, 10),
    0
  )
  .option("-o, --output <dir>", "output directory", ".")
  .action(run);

program.parse();

async function run(
  files: string[],
  opts: { start: number; end: number; output: string }
): Promise<void> {
  const outDir = path.resolve(opts.output);
  ensureOutputDirExists(outDir);

  for (const file of files) {
    await processOneFile(file, opts.start, opts.end, outDir);
  }
}

function ensureOutputDirExists(outDir: string): void {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
}

async function processOneFile(
  file: string,
  startDepth: number,
  endDepth: number,
  outDir: string
): Promise<void> {
  const resolvedPath = path.resolve(file);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  const buffer = fs.readFileSync(resolvedPath);
  const baseName = path.basename(resolvedPath, ".pdf");

  try {
    await splitPdfByBookmarks(buffer, startDepth, endDepth, outDir, baseName);
  } catch (err) {
    console.error(`Error processing ${resolvedPath}:`, err);
    process.exitCode = 1;
  }
}
