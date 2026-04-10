import { HttpError, buildUrl, fetchJson } from "../lib/http.js";

const HISTORY_FIELDS = [
  "id",
  "externalId",
  "userReference",
  "status",
  "createdAt",
  "updatedAt",
  "digStartAt",
  "digEndAt",
].join(",");

export class BydaClient {
  tokenCache = null;

  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  isLive() {
    return !this.config.useMock && Boolean(this.config.clientId) && Boolean(this.config.clientSecret);
  }

  isMock() {
    return !this.isLive();
  }

  getConnectionSummary() {
    return {
      mode: this.isMock() ? "mock" : "live",
      environment: this.config.environment,
      baseUrl: this.config.baseUrl,
      hasClientId: Boolean(this.config.clientId),
      hasClientSecret: Boolean(this.config.clientSecret),
      requestTimeoutMs: this.config.requestTimeoutMs,
    };
  }

  async runDiagnostics({ polygon } = {}) {
    const summary = this.getConnectionSummary();
    const checks = [];

    if (this.isMock()) {
      checks.push({
        name: "mode",
        ok: false,
        message: "Mock mode is enabled. Disable BYDA_USE_MOCK to test the live API.",
      });

      return {
        ok: false,
        ...summary,
        checks,
      };
    }

    try {
      await this.getAccessToken();
      checks.push({
        name: "auth",
        ok: true,
        message: "Access token retrieved successfully.",
      });
    } catch (error) {
      checks.push({
        name: "auth",
        ok: false,
        message: error instanceof Error ? error.message : "Authentication failed.",
      });

      return {
        ok: false,
        ...summary,
        checks,
      };
    }

    try {
      const [planningActivityTypes, excavationActivityTypes] = await Promise.all([
        this.getDomainValues("ENQ_ACT_DESIGN"),
        this.getDomainValues("ENQ_ACT_EXCAVATE"),
      ]);

      checks.push({
        name: "domains",
        ok: true,
        message: `Loaded ${planningActivityTypes.length} planning and ${excavationActivityTypes.length} excavation activity values.`,
      });
    } catch (error) {
      checks.push({
        name: "domains",
        ok: false,
        message: error instanceof Error ? error.message : "Domain lookup failed.",
      });
    }

    if (polygon) {
      try {
        const organisations = await this.getOrganisations(polygon);
        checks.push({
          name: "organisations",
          ok: true,
          message: `Loaded ${organisations.length} organisation candidates for the selected site.`,
        });
      } catch (error) {
        checks.push({
          name: "organisations",
          ok: false,
          message: error instanceof Error ? error.message : "Organisation lookup failed.",
        });
      }
    }

    return {
      ok: checks.every((check) => check.ok),
      ...summary,
      checks,
    };
  }

  async createEnquiry(payload) {
    return this.request("POST", "/enquiries", payload);
  }

  async validateEnquiry(payload) {
    return this.request("POST", "/enquiries", {
      ...payload,
      isDryRun: true,
    });
  }

  async getEnquiry(enquiryId) {
    return this.request("GET", `/enquiries/${enquiryId}`);
  }

  async searchEnquiries({ limit = 20, offset = 0, createdAfter } = {}) {
    const query = {
      limit,
      offset,
      order: "-createdAt",
      fields: HISTORY_FIELDS,
      include: "Address",
      returnGeometry: false,
    };

    if (createdAfter) {
      query.filter = `createdAfter:${createdAfter}`;
    }

    const response = await this.request("GET", "/enquiries", undefined, query);
    const enquiries = Array.isArray(response?.Enquiries) ? response.Enquiries : [];

    return {
      info: response?.Info ?? {
        offset,
        limit,
        count: enquiries.length,
      },
      enquiries: enquiries.map((record) => ({
        enquiryId: record.id ?? null,
        externalId: record.externalId ?? null,
        bydaStatus: record.status ?? null,
        userReference: record.userReference ?? null,
        createdAt: record.createdAt ?? null,
        updatedAt: record.updatedAt ?? null,
        digStartAt: record.digStartAt ?? null,
        digEndAt: record.digEndAt ?? null,
        addressLabel: formatAddressLabel(record.Address),
        address: record.Address ?? null,
      })),
    };
  }

  async getShareLink(enquiryId) {
    const response = await this.request(
      "GET",
      `/enquiries/${enquiryId}/sharelink`,
    );

    if (typeof response === "string") {
      return response;
    }

    return response.url ?? null;
  }

  async requestCombinedZip(enquiryId) {
    return this.request("GET", `/enquiries/${enquiryId}/files/download/zip`);
  }

  async requestCombinedPdf(enquiryId) {
    return this.request("GET", `/enquiries/${enquiryId}/files/download/pdf`);
  }

  async getFileUrl(fileId) {
    const response = await this.request("GET", `/system/files/${fileId}`, undefined, {
      format: "url",
    });

    if (typeof response === "string") {
      return response;
    }

    return response.downloadURL ?? response.url ?? null;
  }

  async getDomainValues(domainName) {
    const response = await this.request(
      "GET",
      `/system/domains/${domainName}`,
    );
    const records = Array.isArray(response)
      ? response
      : response.Values ?? response.DomainValues ?? response.values ?? [];

    return records
      .map((record) => ({
        code: record.value ?? record.code ?? record.name ?? "",
        label: record.label ?? record.name ?? record.value ?? record.code ?? "",
        sequence: record.sequence,
      }))
      .filter((record) => record.code && record.label)
      .sort((left, right) => (left.sequence ?? 9999) - (right.sequence ?? 9999));
  }

  async getOrganisations(polygon) {
    const response = await this.request(
      "GET",
      "/community/organisations",
      undefined,
      {
        // BYDA expects a GeoJSON Polygon coordinates array, not a single linear ring.
        extent: JSON.stringify(polygon.coordinates),
        fields: "id,name,organisationType",
        limit: 50,
      },
    );

    return (response.Organisations ?? []).map((organisation) => ({
      id: organisation.id,
      name: organisation.name,
      organisationType: organisation.organisationType,
    }));
  }

  async probeFileUrl(fileId) {
    try {
      return await this.getFileUrl(fileId);
    } catch (error) {
      if (error instanceof HttpError && [400, 404, 409].includes(error.status)) {
        return null;
      }

      throw error;
    }
  }

  async request(method, pathname, body, query, hasRetried = false) {
    const token = await this.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      return await fetchJson(buildUrl(`${this.config.baseUrl}${pathname}`, query ?? {}), {
        method,
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && !hasRetried) {
        this.tokenCache = null;
        this.logger?.warn("BYDA request returned 401. Clearing token cache and retrying once.", {
          method,
          pathname,
        });
        return this.request(method, pathname, body, query, true);
      }

      this.logger?.warn("BYDA request failed.", {
        method,
        pathname,
        baseUrl: this.config.baseUrl,
        responseBody: error instanceof HttpError ? error.body : undefined,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getAccessToken() {
    if (!this.isLive()) {
      throw new Error("BYDA client requested while mock mode is enabled.");
    }

    const cached = this.tokenCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    let response;

    try {
      response = await fetchJson(`${this.config.baseUrl}/community/auth/tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: this.config.clientId,
          clientSecret: this.config.clientSecret,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      this.logger?.warn("BYDA authentication failed.", {
        baseUrl: this.config.baseUrl,
        environment: this.config.environment,
        responseBody: error instanceof HttpError ? error.body : undefined,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const expiry = response.expiry ? new Date(response.expiry).getTime() : Date.now() + 45 * 60_000;
    this.tokenCache = {
      token: response.access_token,
      expiresAt: expiry - 60_000,
    };

    return response.access_token;
  }
}

function formatAddressLabel(address) {
  if (!address) {
    return null;
  }

  return [
    address.line1,
    address.line2,
    address.locality,
    address.state,
    address.postcode,
  ]
    .filter(Boolean)
    .join(", ");
}
