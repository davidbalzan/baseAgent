import { execFile } from "node:child_process";

interface DockerAvailability {
  available: boolean;
  version?: string;
  error?: string;
}

let cachedAvailability: DockerAvailability | null = null;

/**
 * Check whether Docker is available on the host.
 * Result is cached for the lifetime of the process.
 */
export async function checkDockerAvailability(): Promise<DockerAvailability> {
  if (cachedAvailability) return cachedAvailability;

  cachedAvailability = await new Promise<DockerAvailability>((resolve) => {
    execFile("docker", ["version", "--format", "{{.Server.Version}}"], {
      timeout: 5000,
    }, (error, stdout) => {
      if (error) {
        resolve({ available: false, error: error.message });
      } else {
        resolve({ available: true, version: stdout.trim() });
      }
    });
  });

  return cachedAvailability;
}

/** Reset cached availability — useful for testing. */
export function resetDockerCache(): void {
  cachedAvailability = null;
}

interface StrictShellOpts {
  command: string;
  workspacePath: string;
  timeoutMs: number;
  dockerImage: string;
  maxMemoryMb: number;
  cpuCount: number;
  allowNetwork: boolean;
}

/**
 * Run a shell command in a Docker container with strict isolation:
 * - --network none (unless allowNetwork is true)
 * - --read-only filesystem
 * - Workspace mounted as /workspace (read-write)
 * - Writable /tmp via tmpfs
 * - Resource limits (memory, CPU)
 * - Runs as nobody user
 */
export async function runStrictDocker(opts: StrictShellOpts): Promise<string> {
  const docker = await checkDockerAvailability();
  if (!docker.available) {
    return `[sandbox:strict] Docker is not available: ${docker.error ?? "unknown error"}. Cannot execute in strict sandbox mode.`;
  }

  const {
    command,
    workspacePath,
    timeoutMs,
    dockerImage,
    maxMemoryMb,
    cpuCount,
    allowNetwork,
  } = opts;

  const dockerArgs = [
    "run", "--rm",
    ...(allowNetwork ? [] : ["--network", "none"]),
    "-v", `${workspacePath}:/workspace:rw`,
    "--memory", `${maxMemoryMb}m`,
    "--memory-swap", `${maxMemoryMb}m`,
    "--cpus", String(cpuCount),
    "--user", "nobody",
    "--read-only",
    "--tmpfs", "/tmp:rw,size=64m",
    "-w", "/workspace",
    dockerImage,
    "/bin/sh", "-c", command,
  ];

  return new Promise<string>((resolve) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    execFile("docker", dockerArgs, {
      signal: ac.signal,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      clearTimeout(timer);

      if (error && (error.killed || error.code === "ABORT_ERR")) {
        resolve(`[exit: timeout]\nDocker command timed out after ${timeoutMs}ms`);
        return;
      }

      const exitCode = error?.code ?? 0;
      let output = `[exit: ${exitCode}]\n${stdout}`;
      if (stderr) {
        output += `\n[stderr]\n${stderr}`;
      }
      resolve(output);
    });
  });
}
