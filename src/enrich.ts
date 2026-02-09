import createDebug from "debug";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
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
  const result = (await structured.invoke(systemContent)) as RefsOutput;

  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");
  debug("wrote %s", jsonPath);
}
