import type { SandboxLevel } from "@baseagent/core";

export interface SandboxContext {
  level: SandboxLevel;
  workspacePath: string;
  dockerImage: string;
  maxMemoryMb: number;
  cpuCount: number;
  allowNetwork: boolean;
}

export interface ShellExecOpts {
  command: string;
  workspacePath: string;
  timeoutMs: number;
  env: Record<string, string>;
  maxMemoryMb: number;
  cpuCount: number;
  allowNetwork: boolean;
  dockerImage: string;
}
