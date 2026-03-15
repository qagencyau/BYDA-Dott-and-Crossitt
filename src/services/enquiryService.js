import { randomUUID } from "node:crypto";

const LOCATION_TYPES = ["Road Reserve", "Private"];
const ROAD_LOCATIONS = ["Road", "Nature Strip", "Footpath"];

const FALLBACK_OPTIONS = {
  planning: [
    { code: "CONCEPTUAL_DESIGN", label: "Conceptual Design (fallback)" },
    { code: "ENGINEERING_DESIGN", label: "Engineering Design (fallback)" },
  ],
  excavation: [
    { code: "MANUAL_EXCAVATION", label: "Manual Excavation" },
    { code: "HORIZ_BORING", label: "Horizontal Boring" },
    { code: "VACUUM_EXCAVATION", label: "Vacuum Excavation" },
  ],
};

export class EnquiryService {
  constructor(store, geocoding, bydaClient, maxCandidates) {
    this.store = store;
    this.geocoding = geocoding;
    this.bydaClient = bydaClient;
    this.maxCandidates = maxCandidates;
  }

  async getOptions() {
    const byda = this.bydaClient.getConnectionSummary();

    if (this.bydaClient.isLive()) {
      try {
        const [planningActivityTypes, excavationActivityTypes] = await Promise.all([
          this.bydaClient.getDomainValues("ENQ_ACT_DESIGN"),
          this.bydaClient.getDomainValues("ENQ_ACT_EXCAVATE"),
        ]);

        return {
          mode: "live",
          optionsSource: "live",
          planningActivityTypes,
          excavationActivityTypes,
          locationTypes: LOCATION_TYPES,
          locationsInRoad: ROAD_LOCATIONS,
          byda,
        };
      } catch {
        return {
          mode: "live",
          optionsSource: "fallback",
          planningActivityTypes: FALLBACK_OPTIONS.planning,
          excavationActivityTypes: FALLBACK_OPTIONS.excavation,
          locationTypes: LOCATION_TYPES,
          locationsInRoad: ROAD_LOCATIONS,
          byda,
        };
      }
    }

    return {
      mode: "mock",
      optionsSource: "fallback",
      planningActivityTypes: FALLBACK_OPTIONS.planning,
      excavationActivityTypes: FALLBACK_OPTIONS.excavation,
      locationTypes: LOCATION_TYPES,
      locationsInRoad: ROAD_LOCATIONS,
      byda,
    };
  }

  async searchAddresses(input) {
    const sites = await this.geocoding.search(input);
    return sites.slice(0, this.maxCandidates);
  }

  async listAuthorities(site) {
    if (!this.bydaClient.isLive()) {
      return [];
    }

    try {
      return await this.bydaClient.getOrganisations(site.polygon);
    } catch {
      return [];
    }
  }

  async createEnquiry(input) {
    const resolvedSite = await this.resolveSite(input);
    const now = new Date().toISOString();
    const token = randomUUID();

    if (this.bydaClient.isMock()) {
      const record = {
        token,
        mode: "mock",
        status: "processing",
        message: "Mock enquiry created. A sample report will be available shortly.",
        createdAt: now,
        updatedAt: now,
        bydaEnquiryId: Math.floor(Date.now() / 1000),
        bydaExternalId: Math.floor(Date.now() / 1000),
        bydaStatus: "CREATED",
        input,
        site: resolvedSite,
      };

      await this.store.create(record);
      return record;
    }

    const payload = buildBydaPayload(input, resolvedSite);
    const created = await this.bydaClient.createEnquiry(payload);

    const record = {
      token,
      mode: "live",
      status: "processing",
      message: "Enquiry lodged with BYDA. Waiting for combined report generation.",
      createdAt: now,
      updatedAt: now,
      bydaEnquiryId: created.id,
      bydaExternalId: created.externalId,
      bydaStatus: created.status ?? "CREATED",
      input,
      site: resolvedSite,
    };

    await this.store.create(record);
    return record;
  }

  async validateEnquiry(input) {
    const resolvedSite = await this.resolveSite(input);
    const payload = buildBydaPayload(input, resolvedSite);
    const result = await this.bydaClient.validateEnquiry(payload);

    return {
      resolvedSite,
      payload,
      result,
    };
  }

  async getEnquiry(token) {
    return this.store.get(token);
  }

  async runLiveDiagnostics({ resolvedSite } = {}) {
    return this.bydaClient.runDiagnostics({
      polygon: resolvedSite?.polygon,
    });
  }

  async resolveSite(input) {
    const clientSite = input.resolvedSite;

    if (clientSite) {
      return this.geocoding.enrich(clientSite);
    }

    const matches = await this.geocoding.search(input.address);
    const firstMatch = matches[0];

    if (!firstMatch) {
      throw new Error("Address could not be resolved.");
    }

    return this.geocoding.enrich(firstMatch);
  }
}

function buildBydaPayload(input, site) {
  const locationsInRoad = input.locationTypes.includes("Road Reserve")
    ? input.locationsInRoad
    : [];

  return {
    userReference: input.userReference || undefined,
    digStartAt: input.digStartAt,
    digEndAt: input.digEndAt,
    shape: site.polygon,
    isPlanningJob: input.isPlanningJob,
    activityTypes: input.activityTypes,
    authorityId: input.authorityId,
    otherAuthorityName: input.otherAuthorityName || undefined,
    notes: input.notes || undefined,
    locationTypes: input.locationTypes,
    locationsInRoad,
    source: "API",
    isSandboxTest: input.isSandboxTest || undefined,
    Address: {
      line1: `${input.address.streetNumber} ${input.address.streetName}`.trim(),
      line2: null,
      locality: input.address.suburb,
      state: input.address.state,
      country: "AUS",
      postcode: Number(input.address.postcode),
    },
    userTimezone: input.userTimezone || "Australia/Sydney",
  };
}
