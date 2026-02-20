/** Truncate text to maxLength, appending "..." if needed. */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/** Extract the platform-specific ID from a prefixed channel ID (e.g. "telegram:12345" -> "12345"). */
export function extractChannelId(channelId: string): string | undefined {
  const idx = channelId.indexOf(":");
  if (idx === -1) return undefined;
  const id = channelId.slice(idx + 1);
  return id || undefined;
}
