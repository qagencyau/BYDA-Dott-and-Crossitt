import { config as loadEnv } from "dotenv";

loadEnv();

const DEFAULT_BYDA_BASE_URLS = {
  production: "https://smarterwx.1100.com.au/api",
  uat: "https://swx-sentinel-uat.smarterdbyd.com/api",
};

const args = parseArgs(process.argv.slice(2));
const environment = parseEnvironment(
  args.environment ?? args.env ?? process.env.BYDA_ENVIRONMENT,
);
const baseUrl = trimTrailingSlash(
  args.baseUrl ?? process.env.BYDA_BASE_URL ?? DEFAULT_BYDA_BASE_URLS[environment],
) || DEFAULT_BYDA_BASE_URLS[environment];
const clientId = args.clientId ?? process.env.BYDA_CLIENT_ID ?? "";
const clientSecret = args.clientSecret ?? process.env.BYDA_CLIENT_SECRET ?? "";
const timeoutMs = parsePositiveInteger(
  args.timeoutMs ?? args.timeout ?? process.env.BYDA_REQUEST_TIMEOUT_MS ?? process.env.REQUEST_TIMEOUT_MS,
  20_000,
);
const authOnly = Boolean(args.authOnly);
const dryRunEnquiry = Boolean(args.dryRunEnquiry);

const result = {
  ok: false,
  environment,
  baseUrl,
  timeoutMs,
  credentials: {
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    clientIdPreview: previewSecret(clientId),
    clientSecretPreview: previewSecret(clientSecret),
  },
  checks: [],
};

class HttpStatusError extends Error {
  constructor(message, { status, statusText, url, body }) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.body = body;
  }
}

try {
  printHeader();
  const configOk = validateConfig();

  if (configOk) {
    const auth = await runAuthCheck();

    if (auth.ok && !authOnly) {
      await runDomainCheck(auth.accessToken);

      if (dryRunEnquiry) {
        await runDryRunEnquiryCheck(auth.accessToken);
      }
    }
  }

  finish(result.checks.every((check) => check.ok));
} catch (error) {
  result.checks.push({
    name: "unexpected",
    ok: false,
    message: error instanceof Error ? error.message : "Unexpected credential check failure.",
    details: serializeError(error),
  });
  finish(false);
}

function printHeader() {
  console.log("BYDA credential check");
  console.log(`Environment: ${environment}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`Client ID: ${previewSecret(clientId)}`);
  console.log(`Client secret: ${previewSecret(clientSecret)}`);
  console.log(`Dry-run enquiry: ${dryRunEnquiry ? "enabled" : "disabled"}`);
  console.log("");
}

function validateConfig() {
  if (!["production", "uat"].includes(environment)) {
    result.checks.push({
      name: "configuration",
      ok: false,
      message: `Unsupported BYDA_ENVIRONMENT "${environment}". Use "uat" or "production".`,
    });
  }

  try {
    new URL(baseUrl);
  } catch {
    result.checks.push({
      name: "configuration",
      ok: false,
      message: `BYDA_BASE_URL is not a valid URL: "${baseUrl}".`,
    });
  }

  if (!clientId) {
    result.checks.push({
      name: "configuration",
      ok: false,
      message: "BYDA_CLIENT_ID is missing.",
    });
  }

  if (!clientSecret) {
    result.checks.push({
      name: "configuration",
      ok: false,
      message: "BYDA_CLIENT_SECRET is missing.",
    });
  }

  const ok = !result.checks.some((check) => !check.ok);

  if (!ok) {
    return false;
  }

  result.checks.push({
    name: "configuration",
    ok: true,
    message: "Required BYDA credential settings are present.",
  });

  return true;
}

async function runAuthCheck() {
  const url = `${baseUrl}/community/auth/tokens`;

  try {
    const response = await requestJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
      }),
      timeoutMs,
    });

    const accessToken = typeof response.body?.access_token === "string"
      ? response.body.access_token
      : "";

    if (!accessToken) {
      result.checks.push({
        name: "authentication",
        ok: false,
        message: "BYDA accepted the request but did not return an access token.",
        details: {
          status: response.status,
          body: redactResponseBody(response.body),
        },
      });
      return { ok: false };
    }

    result.checks.push({
      name: "authentication",
      ok: true,
      message: "BYDA returned an access token.",
      details: {
        status: response.status,
        expiry: response.body?.expiry ?? null,
        expiresIn: response.body?.expires_in ?? null,
        tokenPreview: previewSecret(accessToken),
      },
    });

    return {
      ok: true,
      accessToken,
    };
  } catch (error) {
    result.checks.push({
      name: "authentication",
      ok: false,
      message: explainRequestFailure(error, "BYDA authentication failed."),
      details: serializeError(error),
    });
    return { ok: false };
  }
}

async function runDomainCheck(accessToken) {
  const domainName = "ENQ_ACT_DESIGN";
  const url = `${baseUrl}/system/domains/${domainName}`;

  try {
    const response = await requestJson(url, {
      method: "GET",
      headers: {
        Authorization: accessToken,
        "Content-Type": "application/json",
      },
      timeoutMs,
    });

    const values = Array.isArray(response.body)
      ? response.body
      : response.body?.Values ?? response.body?.DomainValues ?? response.body?.values ?? [];

    result.checks.push({
      name: "authorized request",
      ok: true,
      message: `Authenticated BYDA request succeeded. Loaded ${Array.isArray(values) ? values.length : 0} "${domainName}" domain values.`,
      details: {
        status: response.status,
      },
    });
  } catch (error) {
    result.checks.push({
      name: "authorized request",
      ok: false,
      message: explainRequestFailure(
        error,
        "Access token was returned, but a follow-up BYDA request failed.",
      ),
      details: serializeError(error),
    });
  }
}

async function runDryRunEnquiryCheck(accessToken) {
  const url = `${baseUrl}/enquiries`;
  const payload = buildDryRunEnquiryPayload();

  try {
    const response = await requestJson(url, {
      method: "POST",
      headers: {
        Authorization: accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs,
    });

    result.checks.push({
      name: "dry-run enquiry",
      ok: true,
      message: "BYDA accepted a dry-run enquiry payload. These credentials appear authorised for enquiry submission.",
      details: {
        status: response.status,
        responseKeys: response.body && typeof response.body === "object"
          ? Object.keys(response.body)
          : [],
        response: summarizeDryRunResponse(response.body),
      },
    });
  } catch (error) {
    result.checks.push({
      name: "dry-run enquiry",
      ok: false,
      message: explainDryRunFailure(error),
      details: {
        requestSummary: summarizeDryRunPayload(payload),
        error: serializeError(error),
      },
    });
  }
}

async function requestJson(url, { timeoutMs: requestTimeoutMs, ...init }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = parseBody(text);

    if (!response.ok) {
      throw new HttpStatusError(`HTTP ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        url,
        body,
      });
    }

    return {
      status: response.status,
      statusText: response.statusText,
      body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${requestTimeoutMs}ms: ${url}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function parseEnvironment(value) {
  const normalized = String(value || "production").trim().toLowerCase();
  return normalized;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function parseBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildDryRunEnquiryPayload() {
  const digStartAt = args.digStartAt ?? formatDate(addDays(new Date(), 1));
  const digEndAt = args.digEndAt ?? formatDate(addDays(new Date(), 2));

  return {
    userReference: args.userReference ?? `IET-CREDENTIAL-DRY-RUN-${Date.now()}`,
    digStartAt,
    digEndAt,
    shape: {
      type: "Polygon",
      coordinates: [[
        [151.19332, -33.86658],
        [151.19432, -33.86658],
        [151.19432, -33.86558],
        [151.19332, -33.86558],
        [151.19332, -33.86658],
      ]],
    },
    isPlanningJob: true,
    activityTypes: [args.activityType ?? "CONVEYANCING"],
    authorityId: null,
    otherAuthorityName: null,
    notes: "Credential authorisation dry run from BYDA checker.",
    locationTypes: ["Private"],
    locationsInRoad: [],
    source: "API",
    isDryRun: true,
    Address: {
      line1: "48 Pirrama Rd",
      line2: null,
      locality: "Pyrmont",
      state: "NSW",
      country: "AUS",
      postcode: 2009,
    },
    userTimezone: "Australia/Sydney",
  };
}

function summarizeDryRunPayload(payload) {
  return {
    userReference: payload.userReference,
    digStartAt: payload.digStartAt,
    digEndAt: payload.digEndAt,
    isPlanningJob: payload.isPlanningJob,
    activityTypes: payload.activityTypes,
    locationTypes: payload.locationTypes,
    source: payload.source,
    isDryRun: payload.isDryRun,
    address: payload.Address,
    hasShape: Boolean(payload.shape),
  };
}

function summarizeDryRunResponse(body) {
  if (!body || typeof body !== "object") {
    return body;
  }

  return {
    id: body.id ?? body.enquiryId ?? null,
    externalId: body.externalId ?? null,
    status: body.status ?? null,
    message: body.message ?? null,
    error: body.error ?? null,
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function redactResponseBody(body) {
  if (!body || typeof body !== "object") {
    return body;
  }

  return redactObject(body);
}

function redactObject(value) {
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /token|secret|password|credential|authorization/i.test(key)
        ? previewSecret(String(entry ?? ""))
        : redactObject(entry),
    ]),
  );
}

function previewSecret(value) {
  const normalized = String(value || "");

  if (!normalized) {
    return "(missing)";
  }

  if (normalized.length <= 8) {
    return `${"*".repeat(normalized.length)} (${normalized.length} chars)`;
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)} (${normalized.length} chars)`;
}

function explainRequestFailure(error, fallback) {
  if (error instanceof HttpStatusError) {
    if (error.status === 401 || error.status === 403) {
      return `${fallback} BYDA returned ${error.status}; check that the client ID/client secret match the ${environment} environment and that BYDA access is active.`;
    }

    if (error.status === 404) {
      return `${fallback} BYDA returned 404; check BYDA_BASE_URL (${baseUrl}) and BYDA_ENVIRONMENT (${environment}).`;
    }

    return `${fallback} BYDA returned ${error.status} ${error.statusText}.`;
  }

  if (error instanceof TypeError) {
    return `${fallback} Network request failed; check connectivity, DNS, and BYDA_BASE_URL (${baseUrl}).`;
  }

  return fallback;
}

function explainDryRunFailure(error) {
  if (error instanceof HttpStatusError && (error.status === 401 || error.status === 403)) {
    return `BYDA dry-run enquiry submission failed with ${error.status}. Authentication works, but this token is not authorised for POST /enquiries in ${environment}. Ask BYDA to confirm API enquiry creation/lodgement permission for this client.`;
  }

  return explainRequestFailure(error, "BYDA dry-run enquiry submission failed.");
}

function serializeError(error) {
  if (error instanceof HttpStatusError) {
    return {
      status: error.status,
      statusText: error.statusText,
      url: error.url,
      body: redactResponseBody(error.body),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return error;
}

function printCheck(check) {
  const marker = check.ok ? "PASS" : "FAIL";
  console.log(`[${marker}] ${check.name}: ${check.message}`);

  if (check.details !== undefined) {
    console.log(JSON.stringify(check.details, null, 2));
  }
}

function finish(ok) {
  result.ok = ok;

  for (const check of result.checks) {
    printCheck(check);
  }

  console.log("");
  console.log(ok ? "BYDA credential check passed." : "BYDA credential check failed.");
  process.exitCode = ok ? 0 : 1;
}
