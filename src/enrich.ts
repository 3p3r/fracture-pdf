import createDebug from "debug";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { distance } from "fastest-levenshtein";
import { ChatOllama } from "@langchain/ollama";
import type { EnrichOptions } from "./types";

const debug = createDebug("fracturepdf:enrich");

const RefsSchema = z.object({
  refs: z
    .array(z.string())
    .describe("Detected citations, references, mentions or links"),
});

export type RefsOutput = z.infer<typeof RefsSchema>;

const INPUT_PLACEHOLDER = "<INPUT>";

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Similarity in [0, 1]; 1 = identical. */
function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - distance(a, b) / maxLen;
}

/**
 * Return true if ref appears in markdown: exact (normalized) substring or
 * fuzzy match above threshold.
 */
function refExistsInMarkdown(
  ref: string,
  markdown: string,
  opts: {
    threshold: number;
    step: number;
    lenShorter: number;
    lenLonger: number;
  },
): boolean {
  const r = normalizeForMatch(ref);
  const m = normalizeForMatch(markdown);
  if (r.length === 0) return false;
  if (m.includes(r)) return true;
  if (opts.threshold >= 1) return false;

  const minLen = Math.max(1, r.length - opts.lenShorter);
  const maxLen = r.length + opts.lenLonger;
  let best = 0;
  for (let i = 0; i < m.length; i += opts.step) {
    for (let len = minLen; len <= maxLen && i + len <= m.length; len++) {
      const window = m.slice(i, i + len);
      const sim = similarity(r, window);
      if (sim > best) best = sim;
      if (best >= opts.threshold) return true;
    }
  }
  return best >= opts.threshold;
}

/**
 * Filter refs to only those that exist in markdown (exact or fuzzy above threshold).
 */
function validateRefsAgainstMarkdown(
  refs: string[],
  markdown: string,
  opts: EnrichOptions,
): string[] {
  return refs.filter((ref) =>
    refExistsInMarkdown(ref, markdown, {
      threshold: opts.refMatchThreshold,
      step: opts.refMatchStep,
      lenShorter: opts.refMatchLenShorter,
      lenLonger: opts.refMatchLenLonger,
    }),
  );
}

function loadSystemPrompt(systemPromptPath: string, markdown: string): string {
  const resolved = path.resolve(systemPromptPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`System prompt file not found: ${resolved}`);
  }
  const template = fs.readFileSync(resolved, "utf-8");
  return template.replace(INPUT_PLACEHOLDER, markdown);
}

/**
 * Run LLM metadata/enrichment extraction on cleaned markdown and write
 * structured JSON to a file with the same base name as the markdown but .json extension.
 */
export async function extractMetadataAndWrite(
  markdown: string,
  jsonPath: string,
  opts: EnrichOptions,
): Promise<void> {
  const systemContent = loadSystemPrompt(opts.systemPromptPath, markdown);

  const llm = new ChatOllama({
    model: opts.model,
    baseUrl: opts.baseUrl,
    temperature: opts.temperature,
  });

  const structured = llm.withStructuredOutput(RefsSchema);

  debug("calling ollama model=%s", opts.model);
  const raw = (await structured.invoke(systemContent)) as RefsOutput;

  const validatedRefs = validateRefsAgainstMarkdown(raw.refs, markdown, opts);
  const result: RefsOutput = { refs: validatedRefs };
  if (validatedRefs.length < raw.refs.length) {
    debug(
      "refs filtered %d -> %d (threshold=%s)",
      raw.refs.length,
      validatedRefs.length,
      opts.refMatchThreshold.toFixed(2),
    );
  }

  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");
  debug("wrote %s", jsonPath);
}
