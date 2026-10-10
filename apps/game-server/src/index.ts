import { randomUUID } from "node:crypto";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { createRedis } from "./redis";
import { PrismaGameStore } from "./store";
import { createGameServer } from "./server";

async function main(): Promise<void> {
  const config = loadConfig();
  const nodeId = randomUUID().slice(0, 8);
  const logger = createLogger(config.LOG_LEVEL, nodeId);

  const redis = createRedis(config.REDIS_URL);
  const pubClient = createRedis(config.REDIS_URL);
  const subClient = createRedis(config.REDIS_URL);
  const store = new PrismaGameStore();

  const handle = createGameServer({
    redis,
    pubClient,
    subClient,
    store,
    jwtSecret: config.GAME_SERVER_JWT_SECRET,
    webOrigin: config.WEB_ORIGIN,
    graceMs: config.DISCONNECT_GRACE_MS,
    clockTickMs: config.CLOCK_TICK_MS,
    matchSweepMs: config.MATCH_SWEEP_MS,
    nodeId,
    logger,
  });

  handle.httpServer.listen(config.GAME_SERVER_PORT, () => {
    logger.info(
      { port: config.GAME_SERVER_PORT, nodeId, origin: config.WEB_ORIGIN },
      "game server listening",
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref?.();
    try {
      await handle.close();
      await Promise.allSettled([redis.quit(), pubClient.quit(), subClient.quit()]);
      logger.info("shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "shutdown failed");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
