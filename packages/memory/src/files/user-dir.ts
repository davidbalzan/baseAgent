import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

interface UserLink {
  id: string;
  channels: string[];
}

/**
 * Resolve a channelId to a per-user workspace directory.
 *
 * - If `userLinks` contains a mapping for this channelId, uses the linked user id.
 * - Otherwise, sanitises the channelId (e.g. "telegram:123" → "telegram_123").
 * - Creates the directory if it doesn't exist.
 *
 * Returns the absolute path to the user's workspace directory.
 */
export function resolveUserDir(
  workspacePath: string,
  channelId: string,
  userLinks?: UserLink[],
): string {
  let userId: string;

  // Check if channelId is linked to a named user
  const link = userLinks?.find((l) => l.channels.includes(channelId));
  if (link) {
    userId = link.id;
  } else {
    // Sanitise channelId for use as a directory name
    userId = channelId.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  const userDir = resolve(workspacePath, "users", userId);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }

  return userDir;
}
