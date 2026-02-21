import { describe, it, expect } from "vitest";
import {
  parseScopedPath,
  resolveWorkspacePath,
  resolveProjectPath,
  resolveScopedPath,
} from "../built-in/_utils.js";

// ─── parseScopedPath ─────────────────────────────────────────────

describe("parseScopedPath", () => {
  it("returns workspace scope for plain paths", () => {
    expect(parseScopedPath("foo.txt")).toEqual({ scope: "workspace", relativePath: "foo.txt" });
    expect(parseScopedPath("sub/dir/file.ts")).toEqual({ scope: "workspace", relativePath: "sub/dir/file.ts" });
  });

  it("returns project scope when prefixed with project:", () => {
    expect(parseScopedPath("project:packages/core/src/index.ts")).toEqual({
      scope: "project",
      relativePath: "packages/core/src/index.ts",
    });
    expect(parseScopedPath("project:.")).toEqual({
      scope: "project",
      relativePath: ".",
    });
  });

  it("treats project: as literal if not a prefix", () => {
    // A file literally named with "project:" embedded but not at start — shouldn't match
    expect(parseScopedPath("my-project:notes.txt")).toEqual({
      scope: "workspace",
      relativePath: "my-project:notes.txt",
    });
  });
});

// ─── resolveWorkspacePath ─────────────────────────────────────────

describe("resolveWorkspacePath", () => {
  const ws = "/home/user/workspace";

  it("resolves relative paths under workspace", () => {
    expect(resolveWorkspacePath(ws, "foo.txt")).toBe("/home/user/workspace/foo.txt");
    expect(resolveWorkspacePath(ws, "sub/dir/file.ts")).toBe("/home/user/workspace/sub/dir/file.ts");
  });

  it("allows the workspace root itself", () => {
    expect(resolveWorkspacePath(ws, ".")).toBe("/home/user/workspace");
  });

  it("rejects absolute paths", () => {
    expect(() => resolveWorkspacePath(ws, "/etc/passwd")).toThrow("absolute paths are not allowed");
  });

  it("rejects traversal above workspace", () => {
    expect(() => resolveWorkspacePath(ws, "../secret")).toThrow("escapes workspace");
    expect(() => resolveWorkspacePath(ws, "sub/../../secret")).toThrow("escapes workspace");
  });
});

// ─── resolveProjectPath ──────────────────────────────────────────

describe("resolveProjectPath", () => {
  const root = "/home/user/project";

  it("resolves relative paths under project root", () => {
    expect(resolveProjectPath(root, "packages/core/src/index.ts")).toBe(
      "/home/user/project/packages/core/src/index.ts",
    );
  });

  it("allows the project root itself", () => {
    expect(resolveProjectPath(root, ".")).toBe("/home/user/project");
  });

  it("rejects traversal above project root", () => {
    expect(() => resolveProjectPath(root, "../secret")).toThrow("escapes project");
  });

  it("rejects absolute paths", () => {
    expect(() => resolveProjectPath(root, "/etc/passwd")).toThrow("absolute paths are not allowed");
  });
});

// ─── resolveScopedPath ───────────────────────────────────────────

describe("resolveScopedPath", () => {
  const ws = "/home/user/workspace";
  const root = "/home/user/project";

  it("routes plain paths to workspace", () => {
    const result = resolveScopedPath(ws, root, "foo.txt");
    expect(result.scope).toBe("workspace");
    expect(result.resolved).toBe("/home/user/workspace/foo.txt");
  });

  it("routes project: paths to project root", () => {
    const result = resolveScopedPath(ws, root, "project:packages/core/src/index.ts");
    expect(result.scope).toBe("project");
    expect(result.resolved).toBe("/home/user/project/packages/core/src/index.ts");
  });

  it("throws when project root is undefined and project: prefix is used", () => {
    expect(() => resolveScopedPath(ws, undefined, "project:foo")).toThrow("project root not configured");
  });

  it("works without project root for workspace paths", () => {
    const result = resolveScopedPath(ws, undefined, "notes.txt");
    expect(result.scope).toBe("workspace");
    expect(result.resolved).toBe("/home/user/workspace/notes.txt");
  });

  it("rejects traversal in project scope", () => {
    expect(() => resolveScopedPath(ws, root, "project:../../etc/passwd")).toThrow("escapes project");
  });

  it("rejects traversal in workspace scope", () => {
    expect(() => resolveScopedPath(ws, root, "../secret")).toThrow("escapes workspace");
  });
});
