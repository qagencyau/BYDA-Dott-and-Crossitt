import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv();

const DEFAULT_BYDA_BASE_URLS = {
  production: "https://smarterwx.1100.com.au/api",
  uat: "https://swx-sentinel-uat.smarterdbyd.com/api",
};

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value, fallback, { min } = {}) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (min !== undefined && parsed < min) {
    return fallback;
  }

  return parsed;
}

function parseEnum(value, allowedValues, fallback) {
  if (!value) {
    return fallback;
  }

  return allowedValues.includes(value) ? value : fallback;
}

const hasCredentials =
  Boolean(process.env.BYDA_CLIENT_ID) && Boolean(process.env.BYDA_CLIENT_SECRET);

const rootDir = process.cwd();
const bydaEnvironment = parseEnum(
  process.env.BYDA_ENVIRONMENT,
  ["production", "uat"],
  "production",
);
const bydaBaseUrl = (
  process.env.BYDA_BASE_URL ?? DEFAULT_BYDA_BASE_URLS[bydaEnvironment]
).replace(/\/$/, "");

export const appConfig = {
  serviceName: "byda-dott-and-crossitt",
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  port: parseNumber(process.env.PORT, 3000, { min: 1 }),
  dataFile: path.resolve(
    rootDir,
    process.env.DATA_FILE ?? path.join("data", "enquiries.json"),
  ),
  publicDir: path.resolve(rootDir, "public"),
  defaultBufferMeters: parseNumber(process.env.DEFAULT_BUFFER_METERS, 10, { min: 1 }),
  maxAddressCandidates: parseNumber(process.env.MAX_ADDRESS_CANDIDATES, 5, { min: 1 }),
  pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 15_000, { min: 1_000 }),
  maxPollFailures: parseNumber(process.env.MAX_POLL_FAILURES, 5, { min: 1 }),
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 20_000, { min: 1_000 }),
  byda: {
    environment: bydaEnvironment,
    baseUrl: bydaBaseUrl,
    clientId: process.env.BYDA_CLIENT_ID ?? "",
    clientSecret: process.env.BYDA_CLIENT_SECRET ?? "",
    useMock: parseBoolean(process.env.BYDA_USE_MOCK, !hasCredentials),
    requestTimeoutMs: parseNumber(
      process.env.BYDA_REQUEST_TIMEOUT_MS,
      parseNumber(process.env.REQUEST_TIMEOUT_MS, 20_000, { min: 1_000 }),
      { min: 1_000 },
    ),
  },
};
