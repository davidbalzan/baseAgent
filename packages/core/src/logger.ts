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

export function createLogger(name: string): Logger {
  const color = pickColor(name);
  const tag = `${color}[${name}]${RESET}`;

  return {
    log: (message: string) => console.log(`${tag} ${message}`),
    warn: (message: string) => console.warn(`${tag} ${YELLOW}${message}${RESET}`),
    error: (message: string) => console.error(`${tag} ${RED}${message}${RESET}`),
  };
}
