const DEFAULT_MAX_BASENAME_LENGTH = 200;

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim() || "untitled";
}

export function safeBasename(
  parts: string[],
  fallback: string,
  index: number,
  maxLength: number = DEFAULT_MAX_BASENAME_LENGTH
): string {
  const name = parts.join("_") || sanitizeFilename(fallback);
  if (name.length <= maxLength) return name;
  return (
    name.slice(0, maxLength - 4) +
    "_" +
    String(index).padStart(2, "0")
  );
}
