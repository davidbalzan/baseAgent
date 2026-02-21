import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROTECTED_PREFIXES = ["packages/core/"];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export interface WorktreeInfo {
  worktreePath: string;
  branch: string;
}

export async function createWorktree(rootDir: string, description: string): Promise<WorktreeInfo> {
  const hex = randomBytes(3).toString("hex");
  const slug = slugify(description);
  const branch = `enhance/${slug}-${hex}`;
  const worktreePath = join(tmpdir(), `baseagent-enhance-${hex}`);

  await git(["worktree", "add", "-b", branch, worktreePath], rootDir);

  return { worktreePath, branch };
}

export async function commitWorktreeChanges(worktreePath: string, message: string): Promise<void> {
  await git(["add", "-A"], worktreePath);

  // Check if there are changes to commit
  try {
    await git(["diff", "--cached", "--quiet"], worktreePath);
    // If no error, there are no staged changes
    throw new Error("No changes to commit.");
  } catch (err) {
    // git diff --cached --quiet exits non-zero when there ARE changes — that's what we want
    if (err instanceof Error && err.message === "No changes to commit.") {
      throw err;
    }
  }

  await git(["commit", "-m", message], worktreePath);
}

export async function getChangedFiles(worktreePath: string): Promise<string[]> {
  // Get files changed relative to the parent branch (files in the worktree that differ from HEAD of main tree)
  await git(["add", "-A"], worktreePath);
  const output = await git(["diff", "--cached", "--name-only", "HEAD"], worktreePath);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

export function assertNoProtectedChanges(changedFiles: string[]): void {
  const violations = changedFiles.filter((f) =>
    PROTECTED_PREFIXES.some((prefix) => f.startsWith(prefix)),
  );

  if (violations.length > 0) {
    throw new Error(
      `Cannot apply: changes touch protected paths.\n` +
      `Protected: ${PROTECTED_PREFIXES.join(", ")}\n` +
      `Violations:\n${violations.map((f) => `  - ${f}`).join("\n")}\n\n` +
      `Remove changes to these files and re-test before applying.`,
    );
  }
}

export async function mergeWorktree(rootDir: string, branch: string, message: string): Promise<void> {
  try {
    // Try fast-forward first
    await git(["merge", "--ff-only", branch], rootDir);
  } catch {
    // Fall back to merge commit
    await git(["merge", "--no-ff", "-m", message, branch], rootDir);
  }
}

export async function cleanupWorktree(rootDir: string, worktreePath: string, branch: string): Promise<void> {
  try {
    await git(["worktree", "remove", "--force", worktreePath], rootDir);
  } catch {
    // Worktree may already be removed
  }

  try {
    await git(["branch", "-D", branch], rootDir);
  } catch {
    // Branch may already be deleted
  }
}
