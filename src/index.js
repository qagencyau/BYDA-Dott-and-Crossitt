import express from "express";
import { randomUUID } from "node:crypto";

import { appConfig } from "./config.js";
import { createLogger, serializeError } from "./lib/logger.js";
import { createRouter } from "./routes.js";
import { EnquiryService } from "./services/enquiryService.js";
import { GeocodingService } from "./services/geocoding/index.js";
import { EnquiryPoller } from "./services/poller.js";
import { BydaClient } from "./services/bydaClient.js";
import { JsonStore } from "./store/jsonStore.js";

async function main() {
  const startedAt = Date.now();
  const logger = createLogger({
    level: appConfig.logLevel,
    service: appConfig.serviceName,
    environment: appConfig.nodeEnv,
  });
  const store = new JsonStore(appConfig.dataFile, logger.child({ component: "store" }));
  await store.ensureReady();

  const geocoding = new GeocodingService(appConfig.defaultBufferMeters);
  const bydaClient = new BydaClient(appConfig.byda, logger.child({ component: "byda" }));
  const enquiryService = new EnquiryService(
    store,
    geocoding,
    bydaClient,
    appConfig.maxAddressCandidates,
  );
  const poller = new EnquiryPoller(
    store,
    bydaClient,
    appConfig.pollIntervalMs,
    logger.child({ component: "poller" }),
    appConfig.maxPollFailures,
  );

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAtMs = Date.now();
    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);

    response.on("finish", () => {
      logger.info("HTTP request completed.", {
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAtMs,
      });
    });

    next();
  });
  app.use(express.static(appConfig.publicDir));
  app.use(createRouter({
    enquiryService,
    store,
    poller,
    logger: logger.child({ component: "router" }),
    appConfig,
    startedAt,
  }));

  const server = app.listen(appConfig.port, () => {
    logger.info("BYDA app listening.", {
      port: appConfig.port,
      mode: bydaClient.isMock() ? "mock" : "live",
      byda: bydaClient.getConnectionSummary(),
    });
  });

  poller.start();

  const shutdown = () => {
    logger.info("Shutdown signal received.");
    poller.stop();
    server.close(() => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    message: "Application failed to start.",
    error: serializeError(error),
  }));
  process.exitCode = 1;
});
