import createDebug from "debug";

const debug = createDebug("fracturepdf:filename");

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim() || "untitled";
}

export function safeBasename(
  parts: string[],
  fallback: string,
  index: number,
  maxLength: number,
): string {
  const name = parts.join("_") || sanitizeFilename(fallback);
  if (name.length > maxLength)
    debug(
      "truncate basename %d -> %d: %s",
      name.length,
      maxLength,
      `${name.slice(0, 40)}...`,
    );
  return name.length <= maxLength
    ? name
    : `${name.slice(0, maxLength - 4)}_${String(index).padStart(2, "0")}`;
}
