import { z } from "zod";

const envSchema = z.object({
  GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  GAME_SERVER_JWT_SECRET: z.string().min(16, "GAME_SERVER_JWT_SECRET must be set (min 16 chars)"),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  DISCONNECT_GRACE_MS: z.coerce.number().int().positive().default(45_000),
  MATCH_SWEEP_MS: z.coerce.number().int().positive().default(1_000),
  CLOCK_TICK_MS: z.coerce.number().int().positive().default(250),
  LOG_LEVEL: z.string().default("info"),
  ENABLE_REDIS_ADAPTER: z.string().default("false").transform((v) => v === "true"),
});

export type GameServerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GameServerConfig {
  return envSchema.parse({
    GAME_SERVER_PORT: env.GAME_SERVER_PORT ?? env.PORT,
    REDIS_URL: env.REDIS_URL,
    GAME_SERVER_JWT_SECRET: env.GAME_SERVER_JWT_SECRET,
    WEB_ORIGIN: env.WEB_ORIGIN,
    DISCONNECT_GRACE_MS: env.DISCONNECT_GRACE_MS,
    MATCH_SWEEP_MS: env.MATCH_SWEEP_MS,
    CLOCK_TICK_MS: env.CLOCK_TICK_MS,
    LOG_LEVEL: env.LOG_LEVEL,
    ENABLE_REDIS_ADAPTER: env.ENABLE_REDIS_ADAPTER,
  });
}
