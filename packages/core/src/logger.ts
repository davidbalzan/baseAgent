const COLORS = [
  "\x1b[36m",  // cyan
  "\x1b[35m",  // magenta
  "\x1b[33m",  // yellow
  "\x1b[32m",  // green
  "\x1b[34m",  // blue
  "\x1b[96m",  // bright cyan
  "\x1b[95m",  // bright magenta
  "\x1b[93m",  // bright yellow
  "\x1b[92m",  // bright green
  "\x1b[94m",  // bright blue
] as const;

const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

const colorMap = new Map<string, string>();

function pickColor(name: string): string {
  const existing = colorMap.get(name);
  if (existing) return existing;
  const color = COLORS[colorMap.size % COLORS.length];
  colorMap.set(name, color);
  return color;
}

export interface Logger {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

// --------------- In-memory log ring buffer ---------------

export interface LogEntry {
  timestamp: string;
  level: "log" | "warn" | "error";
  name: string;
  message: string;
}

const LOG_BUFFER: LogEntry[] = [];
const MAX_LOG_ENTRIES = 500;

function pushLog(level: LogEntry["level"], name: string, message: string): void {
  if (LOG_BUFFER.length >= MAX_LOG_ENTRIES) LOG_BUFFER.shift();
  LOG_BUFFER.push({ timestamp: new Date().toISOString(), level, name, message });
}

export function getRecentLogs(filter?: {
  name?: string;
  level?: string;
  limit?: number;
}): LogEntry[] {
  let entries: LogEntry[] = LOG_BUFFER;
  if (filter?.name) {
    const n = filter.name;
    entries = entries.filter((e) => e.name === n);
  }
  if (filter?.level) {
    const l = filter.level;
    entries = entries.filter((e) => e.level === l);
  }
  const limit = filter?.limit ?? 50;
  return entries.slice(-limit);
}

// ---------------------------------------------------------

export function createLogger(name: string): Logger {
  const color = pickColor(name);
  const tag = `${color}[${name}]${RESET}`;

  return {
    log: (message: string) => { pushLog("log", name, message); console.log(`${tag} ${message}`); },
    warn: (message: string) => { pushLog("warn", name, message); console.warn(`${tag} ${YELLOW}${message}${RESET}`); },
    error: (message: string) => { pushLog("error", name, message); console.error(`${tag} ${RED}${message}${RESET}`); },
  };
}
