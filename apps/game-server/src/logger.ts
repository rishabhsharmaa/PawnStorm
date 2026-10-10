import pino, { type Logger } from "pino";

export function createLogger(level = "info", nodeId = "node"): Logger {
  return pino({ level, base: { node: nodeId } });
}
