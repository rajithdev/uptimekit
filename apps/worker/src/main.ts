import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { createWorkerRuntime } from "./runtime";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const runtime = createWorkerRuntime(config, logger);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "received shutdown signal");
  const force = setTimeout(() => {
    logger.error("graceful shutdown timed out; exiting");
    process.exit(1);
  }, 75_000);
  force.unref();
  try {
    await runtime.stop();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled rejection"));

runtime.start().catch((err) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
