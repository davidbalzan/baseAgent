import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getAnthropicOauthAccessToken, getOpenAIOauthAccessToken } from "../anthropic-oauth.js";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ANTHROPIC_OAUTH_AUTH_FILE;
  delete process.env.OPENAI_OAUTH_AUTH_FILE;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempAuthFile(payload: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "anthropic-oauth-test-"));
  tempDirs.push(dir);
  const filePath = join(dir, "auth.json");
  writeFileSync(filePath, JSON.stringify(payload), "utf-8");
  return filePath;
}

describe("getAnthropicOauthAccessToken", () => {
  it("returns access token when oauth credentials are valid", () => {
    const authFilePath = makeTempAuthFile({
      anthropic: {
        type: "oauth",
        access: "sk-ant-oat01-test",
        expires: Date.now() + 60_000,
      },
    });

    const token = getAnthropicOauthAccessToken({ authFilePath });
    expect(token).toBe("sk-ant-oat01-test");
  });

  it("returns undefined when oauth token is expired", () => {
    const now = 1_700_000_000_000;
    const authFilePath = makeTempAuthFile({
      anthropic: {
        type: "oauth",
        access: "sk-ant-oat01-expired",
        expires: now - 1,
      },
    });

    const token = getAnthropicOauthAccessToken({ authFilePath, nowMs: now });
    expect(token).toBeUndefined();
  });

  it("uses ANTHROPIC_OAUTH_AUTH_FILE when explicit path is not provided", () => {
    const authFilePath = makeTempAuthFile({
      anthropic: {
        type: "oauth",
        access: "sk-ant-oat01-env",
        expires: Date.now() + 60_000,
      },
    });
    process.env.ANTHROPIC_OAUTH_AUTH_FILE = authFilePath;

    const token = getAnthropicOauthAccessToken();
    expect(token).toBe("sk-ant-oat01-env");
  });

  it("returns undefined when auth file does not exist", () => {
    const token = getAnthropicOauthAccessToken({
      authFilePath: "/tmp/does-not-exist-opencode-auth.json",
    });

    expect(token).toBeUndefined();
  });
});

describe("getOpenAIOauthAccessToken", () => {
  it("returns access token when oauth credentials are valid", () => {
    const authFilePath = makeTempAuthFile({
      openai: {
        type: "oauth",
        access: "openai-access-token",
        expires: Date.now() + 60_000,
      },
    });

    const token = getOpenAIOauthAccessToken({ authFilePath });
    expect(token).toBe("openai-access-token");
  });

  it("returns undefined when oauth token is expired", () => {
    const now = 1_700_000_000_000;
    const authFilePath = makeTempAuthFile({
      openai: {
        type: "oauth",
        access: "openai-access-token-expired",
        expires: now - 1,
      },
    });

    const token = getOpenAIOauthAccessToken({ authFilePath, nowMs: now });
    expect(token).toBeUndefined();
  });

  it("uses OPENAI_OAUTH_AUTH_FILE when explicit path is not provided", () => {
    const authFilePath = makeTempAuthFile({
      openai: {
        type: "oauth",
        access: "openai-access-token-env",
        expires: Date.now() + 60_000,
      },
    });
    process.env.OPENAI_OAUTH_AUTH_FILE = authFilePath;

    const token = getOpenAIOauthAccessToken();
    expect(token).toBe("openai-access-token-env");
  });

  it("returns undefined when auth file does not exist", () => {
    const token = getOpenAIOauthAccessToken({
      authFilePath: "/tmp/does-not-exist-opencode-auth-openai.json",
    });

    expect(token).toBeUndefined();
  });
});
