import { Router } from "express";
import { z, ZodError } from "zod";

import { HttpError } from "./lib/http.js";
import { SUPPORTED_STATES } from "./types.js";

const addressSchema = z.object({
  streetNumber: z.string().trim().min(1).max(20),
  streetName: z.string().trim().min(2).max(100),
  suburb: z.string().trim().min(2).max(80),
  state: z.enum(SUPPORTED_STATES),
  postcode: z.string().regex(/^\d{4}$/),
});

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

const resolvedSiteSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  state: z.enum(SUPPORTED_STATES),
  address: addressSchema,
  point: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  polygon: polygonSchema,
  source: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const createEnquirySchema = z
  .object({
    address: addressSchema,
    resolvedSite: resolvedSiteSchema.optional(),
    userReference: z.string().trim().max(100).optional(),
    digStartAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    digEndAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isPlanningJob: z.boolean(),
    activityTypes: z.array(z.string().min(1)).min(1),
    locationTypes: z.array(z.enum(["Road Reserve", "Private"])).min(1),
    locationsInRoad: z.array(z.enum(["Road", "Nature Strip", "Footpath"])).default([]),
    authorityId: z.number().int().positive().optional(),
    otherAuthorityName: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
    userTimezone: z.string().trim().max(64).optional(),
    isSandboxTest: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.digEndAt < value.digStartAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["digEndAt"],
        message: "digEndAt must be on or after digStartAt",
      });
    }

    if (value.locationTypes.includes("Road Reserve") && value.locationsInRoad.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationsInRoad"],
        message: "locationsInRoad is required when Road Reserve is selected",
      });
    }

    if (value.authorityId && value.otherAuthorityName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otherAuthorityName"],
        message: "Provide either authorityId or otherAuthorityName, not both",
      });
    }
  });

const diagnosticsSchema = z.object({
  resolvedSite: resolvedSiteSchema.optional(),
});

const enquiryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  source: z.enum(["local", "byda", "all"]).optional(),
  createdAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const enquiryAddressQuerySchema = addressSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  source: z.enum(["local", "byda", "all"]).optional(),
  createdAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const bydaEnquiryParamSchema = z.object({
  enquiryId: z.coerce.number().int().positive(),
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildReadyUrl(record) {
  if (!record) {
    return null;
  }

  const hasReportLink = Boolean(record.readyUrl ?? record.fileUrl ?? record.shareUrl);

  if (!hasReportLink) {
    return null;
  }

  const trackingToken = record.trackingToken ?? record.token ?? null;

  if (trackingToken) {
    return `/api/enquiries/${encodeURIComponent(String(trackingToken))}/report`;
  }

  if (record.enquiryId) {
    return `/api/enquiries/byda/${encodeURIComponent(String(record.enquiryId))}/report`;
  }

  return null;
}

function toHistoryPayload(record) {
  if (!record) {
    return null;
  }

  return {
    ...record,
    readyUrl: buildReadyUrl(record),
  };
}

function toStatusPayload(record) {
  if (!record) {
    return null;
  }

  return {
    source: "local",
    token: record.token,
    trackingToken: record.token,
    mode: record.mode,
    status: record.status,
    trackingStatus: record.status,
    displayStatus: record.status ?? record.bydaStatus ?? "unknown",
    message: record.message,
    enquiryId: record.bydaEnquiryId,
    externalId: record.bydaExternalId,
    bydaStatus: record.bydaStatus,
    readyUrl: buildReadyUrl({
      token: record.token,
      trackingToken: record.token,
      enquiryId: record.bydaEnquiryId,
      fileUrl: record.fileUrl ?? null,
      shareUrl: record.shareUrl ?? null,
    }),
    fileUrl: record.fileUrl ?? null,
    shareUrl: record.shareUrl ?? null,
    error: record.error ?? null,
    site: record.site,
    addressLabel: record.site?.label ?? null,
    userReference: record.input?.userReference ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastPolledAt: record.lastPolledAt ?? null,
  };
}

export function createRouter({ enquiryService, store, poller, logger, appConfig, startedAt }) {
  const router = Router();

  router.get("/api/health", asyncHandler(async (_request, response) => {
    const [storeStats, enquiryCount] = await Promise.all([
      store.getStats(),
      store.count(),
    ]);

    response.json({
      ok: true,
      service: appConfig.serviceName,
      environment: appConfig.nodeEnv,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      startedAt: new Date(startedAt).toISOString(),
      enquiryCount,
      store: storeStats,
      poller: poller.getStats(),
      byda: enquiryService.bydaClient.getConnectionSummary(),
      requestId: response.locals.requestId,
    });
  }));

  router.get("/api/options", asyncHandler(async (_request, response) => {
    response.json(await enquiryService.getOptions());
  }));

  router.get("/api/enquiries", asyncHandler(async (request, response) => {
    const query = enquiryListQuerySchema.parse(request.query);
    const history = await enquiryService.listEnquiries({
      limit: query.limit ?? 20,
      source: query.source ?? "local",
      createdAfter: query.createdAfter,
    });

    response.json({
      ...history,
      enquiries: history.enquiries.map((record) => toHistoryPayload(record)),
      requestId: response.locals.requestId,
    });
  }));

  router.get("/api/enquiries/by-address", asyncHandler(async (request, response) => {
    const query = enquiryAddressQuerySchema.parse(request.query);
    const history = await enquiryService.findEnquiriesByAddress({
      address: {
        streetNumber: query.streetNumber,
        streetName: query.streetName,
        suburb: query.suburb,
        state: query.state,
        postcode: query.postcode,
      },
      limit: query.limit ?? 6,
      source: query.source ?? "all",
      createdAfter: query.createdAfter,
    });

    response.json({
      ...history,
      enquiries: history.enquiries.map((record) => toHistoryPayload(record)),
      requestId: response.locals.requestId,
    });
  }));

  router.get("/api/addresses/search", asyncHandler(async (request, response) => {
    const input = addressSchema.parse({
      streetNumber: request.query.streetNumber,
      streetName: request.query.streetName,
      suburb: request.query.suburb,
      state: request.query.state,
      postcode: request.query.postcode,
    });

    const sites = await enquiryService.searchAddresses(input);
    response.json({ sites });
  }));

  router.post("/api/organisations/search", asyncHandler(async (request, response) => {
    const payload = z.object({ resolvedSite: resolvedSiteSchema }).parse(request.body);
    const organisations = await enquiryService.listAuthorities(payload.resolvedSite);
    response.json({ organisations });
  }));

  router.post("/api/diagnostics/live", asyncHandler(async (request, response) => {
    const payload = diagnosticsSchema.parse(request.body ?? {});
    const diagnostics = await enquiryService.runLiveDiagnostics(payload);
    response.json({
      ...diagnostics,
      requestId: response.locals.requestId,
    });
  }));

  router.post("/api/enquiries", asyncHandler(async (request, response) => {
    const payload = createEnquirySchema.parse(request.body);
    const record = await enquiryService.createEnquiry(payload);
    response.status(201).json({
      token: record.token,
      mode: record.mode,
      status: record.status,
      message: record.message,
      enquiryId: record.bydaEnquiryId,
    });
  }));

  router.post("/api/enquiries/dry-run", asyncHandler(async (request, response) => {
    const payload = createEnquirySchema.parse(request.body);
    const validation = await enquiryService.validateEnquiry(payload);
    response.json({
      ok: true,
      message: "BYDA accepted the dry-run enquiry payload.",
      resolvedSite: validation.resolvedSite,
      payload: validation.payload,
      result: validation.result,
      requestId: response.locals.requestId,
    });
  }));

  router.get("/api/enquiries/byda/:enquiryId", asyncHandler(async (request, response) => {
    const params = bydaEnquiryParamSchema.parse(request.params);
    const status = await enquiryService.getRemoteEnquiryStatus(params.enquiryId);
    response.json(toHistoryPayload(status));
  }));

  router.get("/api/enquiries/byda/:enquiryId/report", asyncHandler(async (request, response) => {
    const params = bydaEnquiryParamSchema.parse(request.params);
    const reportUrl = await enquiryService.getEnquiryReportUrl({ enquiryId: params.enquiryId });

    if (!reportUrl) {
      response.status(404).json({
        error: "Report is not available for this enquiry yet.",
        requestId: response.locals.requestId,
      });
      return;
    }

    response.redirect(reportUrl);
  }));

  router.get("/api/enquiries/:token", asyncHandler(async (request, response) => {
    const record = await enquiryService.getEnquiry(String(request.params.token));

    if (!record) {
      response.status(404).json({ error: "Tracking token not found." });
      return;
    }

    response.json(toStatusPayload(record));
  }));

  router.get("/api/enquiries/:token/report", asyncHandler(async (request, response) => {
    const token = String(request.params.token);
    const reportUrl = await enquiryService.getEnquiryReportUrl({ token });

    if (!reportUrl) {
      response.status(404).json({
        error: "Report is not available for this enquiry yet.",
        requestId: response.locals.requestId,
      });
      return;
    }

    response.redirect(reportUrl);
  }));

  router.get("/mock-reports/:token", asyncHandler(async (request, response) => {
    const record = await store.get(String(request.params.token));

    if (!record) {
      response.status(404).send("Mock report not found.");
      return;
    }

    const html = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Mock BYDA Report</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #f5f0e8; color: #1a1f1d; }
            main { max-width: 760px; margin: 0 auto; background: white; padding: 2rem; border-radius: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08); }
            h1 { margin-top: 0; }
            dl { display: grid; grid-template-columns: 180px 1fr; gap: 0.75rem 1rem; }
            dt { font-weight: 700; }
            dd { margin: 0; }
            pre { overflow: auto; background: #f3efe7; padding: 1rem; border-radius: 12px; }
          </style>
        </head>
        <body>
          <main>
            <h1>Mock BYDA Report</h1>
            <p>This is a placeholder report generated by the local mock workflow.</p>
            <dl>
              <dt>Tracking token</dt>
              <dd>${escapeHtml(record.token)}</dd>
              <dt>Address</dt>
              <dd>${escapeHtml(record.site.label)}</dd>
              <dt>Status</dt>
              <dd>${escapeHtml(record.status)}</dd>
              <dt>Created</dt>
              <dd>${escapeHtml(record.createdAt)}</dd>
            </dl>
            <h2>Submitted payload</h2>
            <pre>${escapeHtml(JSON.stringify(record.input, null, 2))}</pre>
          </main>
        </body>
      </html>
    `;

    response.type("html").send(html);
  }));

  router.use((error, _request, response, _next) => {
    logger?.error("Request failed.", {
      requestId: response.locals.requestId,
      error,
    });

    if (error instanceof ZodError) {
      response.status(400).json({
        error: "Invalid request payload.",
        issues: error.flatten(),
        requestId: response.locals.requestId,
      });
      return;
    }

    if (error instanceof HttpError) {
      const message =
        appConfig.nodeEnv === "production"
          ? "Upstream API request failed."
          : error.message;

      response.status(error.status).json({
        error: message,
        details: error.body ?? null,
        requestId: response.locals.requestId,
      });
      return;
    }

    const message =
      appConfig.nodeEnv === "production"
        ? "Unexpected server error."
        : error instanceof Error
          ? error.message
          : "Unexpected server error.";

    response.status(500).json({
      error: message,
      requestId: response.locals.requestId,
    });
  });

  return router;
}

function asyncHandler(handler) {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}
