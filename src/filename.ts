const MAX_BASENAME_LENGTH = 200;

export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_").trim() || "untitled";
}

export function safeBasename(
  parts: string[],
  fallback: string,
  index: number
): string {
  const name = parts.join("_") || sanitizeFilename(fallback);
  if (name.length <= MAX_BASENAME_LENGTH) return name;
  return (
    name.slice(0, MAX_BASENAME_LENGTH - 4) +
    "_" +
    String(index).padStart(2, "0")
  );
}
