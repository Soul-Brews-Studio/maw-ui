export function wsServerError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const frame = data as { type?: unknown; error?: unknown };
  return frame.type === "error" && typeof frame.error === "string" ? frame.error : null;
}
