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

  async listEnquiries({ source = "local", limit = 20, createdAfter } = {}) {
    const wantsLocal = source === "local" || source === "all";
    const wantsByda = (source === "byda" || source === "all") && this.bydaClient.isLive();

    const [localRecords, remoteResult] = await Promise.all([
      wantsLocal ? this.store.list() : Promise.resolve([]),
      wantsByda
        ? this.bydaClient.searchEnquiries({ limit, createdAfter })
        : Promise.resolve({
            info: { limit, count: 0 },
            enquiries: [],
          }),
    ]);

    const sorted = await this.mergeHistoryRecords({
      localRecords: wantsLocal ? localRecords : [],
      remoteRecords: remoteResult.enquiries,
      limit,
    });

    return {
      enquiries: sorted,
      total:
        source === "byda"
          ? remoteResult.info?.count ?? sorted.length
          : source === "local"
            ? localRecords.length
            : sorted.length,
    };
  }

  async findEnquiriesByAddress({ address, source = "all", limit = 6, createdAfter } = {}) {
    const wantsLocal = source === "local" || source === "all";
    const wantsByda = (source === "byda" || source === "all") && this.bydaClient.isLive();
    const remoteSearchLimit = Math.max(limit * 5, 50);

    const [localRecords, remoteResult] = await Promise.all([
      wantsLocal ? this.store.list() : Promise.resolve([]),
      wantsByda
        ? this.bydaClient.searchEnquiries({ limit: remoteSearchLimit, createdAfter })
        : Promise.resolve({
            info: { limit: remoteSearchLimit, count: 0 },
            enquiries: [],
          }),
    ]);

    const matchedLocalRecords = wantsLocal
      ? localRecords.filter((record) => matchesLocalRecordAddress(record, address))
      : [];
    const matchedRemoteRecords = remoteResult.enquiries.filter((record) =>
      matchesRemoteRecordAddress(record, address),
    );

    const matchedEnquiries = await this.mergeHistoryRecords({
      localRecords: matchedLocalRecords,
      remoteRecords: matchedRemoteRecords,
    });

    return {
      enquiries: matchedEnquiries.slice(0, limit),
      total: matchedEnquiries.length,
    };
  }

  async mergeHistoryRecords({ localRecords = [], remoteRecords = [], limit } = {}) {
    const localRecordsByEnquiryId = new Map(
      localRecords
        .filter((record) => Number.isFinite(record.bydaEnquiryId))
        .map((record) => [record.bydaEnquiryId, record]),
    );
    const matchedTokens = new Set();
    const enquiries = [];

    for (const remote of remoteRecords) {
      const local = findMatchingLocalRecord({
        localRecords,
        localRecordsByEnquiryId,
        matchedTokens,
        remoteRecord: remote,
      });

      if (local) {
        matchedTokens.add(local.token);
        const linkedLocal = await this.linkRemoteIdentifiers(local, remote);

        if (linkedLocal.bydaEnquiryId) {
          localRecordsByEnquiryId.set(linkedLocal.bydaEnquiryId, linkedLocal);
        }

        enquiries.push(mergeHistoryItem(linkedLocal, remote));
        continue;
      }

      enquiries.push(toRemoteHistoryItem(remote));
    }

    for (const local of localRecords) {
      if (matchedTokens.has(local.token)) {
        continue;
      }

      enquiries.push(toLocalHistoryItem(local));
    }

    const sorted = enquiries.sort((left, right) => compareIsoDates(right.createdAt, left.createdAt));
    return limit === undefined ? sorted : sorted.slice(0, limit);
  }

  async getRemoteEnquiryStatus(enquiryId) {
    if (!this.bydaClient.isLive()) {
      throw new Error("BYDA live history is unavailable while mock mode is enabled.");
    }

    const detail = await this.bydaClient.getEnquiry(enquiryId);
    const localRecord = await this.findLocalRecordForRemote({
      enquiryId,
      externalId: detail?.externalId ?? null,
      userReference: detail?.userReference ?? null,
      createdAt: detail?.createdAt ?? null,
      bydaStatus: detail?.status ?? null,
    });

    const shareUrl = localRecord?.shareUrl ?? (await safelyResolve(() => this.bydaClient.getShareLink(enquiryId)));
    let combinedFileId = localRecord?.combinedFileId ?? null;
    let combinedJobId = localRecord?.combinedJobId ?? null;
    let fileUrl = localRecord?.fileUrl ?? null;

    if (!combinedFileId) {
      const downloadRequest = await safelyResolve(() => this.bydaClient.requestCombinedZip(enquiryId));
      combinedFileId = downloadRequest?.File?.id ?? null;
      combinedJobId = downloadRequest?.Job?.id ?? null;
    }

    if (combinedFileId && !fileUrl) {
      fileUrl = await safelyResolve(() => this.bydaClient.probeFileUrl(combinedFileId));
    }

    const addressLabel = formatAddressLabel(detail?.Address) ?? localRecord?.site?.label ?? null;
    const trackingStatus = localRecord?.status ?? (fileUrl ? "ready" : "processing");

    return {
      source: localRecord ? "both" : "byda",
      token: localRecord?.token ?? null,
      trackingToken: localRecord?.token ?? null,
      mode: localRecord?.mode ?? "live",
      status: trackingStatus,
      trackingStatus,
      displayStatus: trackingStatus,
      message: localRecord?.message ?? buildRemoteStatusMessage({ fileUrl, shareUrl }),
      enquiryId: detail?.id ?? enquiryId,
      externalId: detail?.externalId ?? localRecord?.bydaExternalId ?? null,
      bydaStatus: detail?.status ?? localRecord?.bydaStatus ?? null,
      readyUrl: fileUrl ?? shareUrl ?? null,
      fileUrl,
      shareUrl,
      error: localRecord?.error ?? null,
      site: localRecord?.site ?? null,
      addressLabel,
      userReference: detail?.userReference ?? localRecord?.input?.userReference ?? null,
      createdAt: detail?.createdAt ?? localRecord?.createdAt ?? null,
      updatedAt: detail?.updatedAt ?? localRecord?.updatedAt ?? null,
      lastPolledAt: localRecord?.lastPolledAt ?? null,
    };
  }

  async runLiveDiagnostics({ resolvedSite } = {}) {
    return this.bydaClient.runDiagnostics({
      polygon: resolvedSite?.polygon,
    });
  }

  async findLocalRecordForRemote(remoteRecord) {
    const exactMatch = remoteRecord.enquiryId
      ? await this.store.findByBydaEnquiryId(remoteRecord.enquiryId)
      : null;

    if (exactMatch) {
      return this.linkRemoteIdentifiers(exactMatch, remoteRecord);
    }

    if (!remoteRecord.userReference) {
      return null;
    }

    const localRecords = await this.store.list();
    const fallbackMatch = findMatchingLocalRecord({
      localRecords,
      localRecordsByEnquiryId: new Map(),
      matchedTokens: new Set(),
      remoteRecord,
    });

    if (!fallbackMatch) {
      return null;
    }

    return this.linkRemoteIdentifiers(fallbackMatch, remoteRecord);
  }

  async linkRemoteIdentifiers(localRecord, remoteRecord) {
    if (!localRecord) {
      return null;
    }

    const needsBackfill =
      (remoteRecord.enquiryId && !localRecord.bydaEnquiryId) ||
      (remoteRecord.externalId && !localRecord.bydaExternalId) ||
      (remoteRecord.bydaStatus && remoteRecord.bydaStatus !== localRecord.bydaStatus);

    if (!needsBackfill) {
      return localRecord;
    }

    const updated = await this.store.update(localRecord.token, (current) => ({
      ...current,
      bydaEnquiryId: current.bydaEnquiryId ?? remoteRecord.enquiryId ?? null,
      bydaExternalId: current.bydaExternalId ?? remoteRecord.externalId ?? null,
      bydaStatus: remoteRecord.bydaStatus ?? current.bydaStatus ?? null,
    }));

    return updated ?? {
      ...localRecord,
      bydaEnquiryId: localRecord.bydaEnquiryId ?? remoteRecord.enquiryId ?? null,
      bydaExternalId: localRecord.bydaExternalId ?? remoteRecord.externalId ?? null,
      bydaStatus: remoteRecord.bydaStatus ?? localRecord.bydaStatus ?? null,
    };
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

function toLocalHistoryItem(record) {
  return {
    source: "local",
    token: record.token,
    trackingToken: record.token,
    mode: record.mode,
    status: record.status,
    trackingStatus: record.status,
    displayStatus: record.status ?? record.bydaStatus ?? "unknown",
    message: record.message,
    enquiryId: record.bydaEnquiryId ?? null,
    externalId: record.bydaExternalId ?? null,
    bydaStatus: record.bydaStatus ?? null,
    readyUrl: record.fileUrl ?? record.shareUrl ?? null,
    fileUrl: record.fileUrl ?? null,
    shareUrl: record.shareUrl ?? null,
    error: record.error ?? null,
    userReference: record.input?.userReference ?? null,
    addressLabel: record.site?.label ?? null,
    siteSource: record.site?.source ?? null,
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    lastPolledAt: record.lastPolledAt ?? null,
  };
}

function toRemoteHistoryItem(record) {
  return {
    source: "byda",
    token: null,
    trackingToken: null,
    mode: "live",
    status: null,
    trackingStatus: null,
    displayStatus: record.bydaStatus ?? "unknown",
    message: "Loaded from BYDA history search.",
    enquiryId: record.enquiryId,
    externalId: record.externalId,
    bydaStatus: record.bydaStatus ?? null,
    readyUrl: null,
    fileUrl: null,
    shareUrl: null,
    error: null,
    userReference: record.userReference ?? null,
    addressLabel: record.addressLabel ?? null,
    siteSource: "BYDA search",
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    lastPolledAt: null,
  };
}

function mergeHistoryItem(localRecord, remoteRecord) {
  return {
    source: "both",
    token: localRecord.token,
    trackingToken: localRecord.token,
    mode: localRecord.mode,
    status: localRecord.status,
    trackingStatus: localRecord.status,
    displayStatus: localRecord.status ?? remoteRecord.bydaStatus ?? "unknown",
    message: localRecord.message,
    enquiryId: remoteRecord.enquiryId ?? localRecord.bydaEnquiryId ?? null,
    externalId: remoteRecord.externalId ?? localRecord.bydaExternalId ?? null,
    bydaStatus: remoteRecord.bydaStatus ?? localRecord.bydaStatus ?? null,
    readyUrl: localRecord.fileUrl ?? localRecord.shareUrl ?? null,
    fileUrl: localRecord.fileUrl ?? null,
    shareUrl: localRecord.shareUrl ?? null,
    error: localRecord.error ?? null,
    userReference: remoteRecord.userReference ?? localRecord.input?.userReference ?? null,
    addressLabel: remoteRecord.addressLabel ?? localRecord.site?.label ?? null,
    siteSource: localRecord.site?.source ?? "BYDA search",
    createdAt: remoteRecord.createdAt ?? localRecord.createdAt ?? null,
    updatedAt: remoteRecord.updatedAt ?? localRecord.updatedAt ?? null,
    lastPolledAt: localRecord.lastPolledAt ?? null,
  };
}

function compareIsoDates(left, right) {
  const leftTime = Number.isFinite(Date.parse(left ?? "")) ? Date.parse(left) : 0;
  const rightTime = Number.isFinite(Date.parse(right ?? "")) ? Date.parse(right) : 0;
  return leftTime - rightTime;
}

function findMatchingLocalRecord({
  localRecords,
  localRecordsByEnquiryId,
  matchedTokens,
  remoteRecord,
}) {
  if (remoteRecord.enquiryId && localRecordsByEnquiryId.has(remoteRecord.enquiryId)) {
    const exactMatch = localRecordsByEnquiryId.get(remoteRecord.enquiryId);

    if (!matchedTokens.has(exactMatch.token)) {
      return exactMatch;
    }
  }

  if (!remoteRecord.userReference) {
    return null;
  }

  const fallbackCandidates = localRecords
    .filter((record) => !matchedTokens.has(record.token))
    .filter((record) => record.input?.userReference === remoteRecord.userReference)
    .sort((left, right) =>
      Math.abs(toTimestamp(left.createdAt) - toTimestamp(remoteRecord.createdAt))
      - Math.abs(toTimestamp(right.createdAt) - toTimestamp(remoteRecord.createdAt)),
    );

  return fallbackCandidates[0] ?? null;
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

function buildRemoteStatusMessage({ fileUrl, shareUrl }) {
  if (fileUrl) {
    return "Combined BYDA report is ready.";
  }

  if (shareUrl) {
    return "BYDA historical enquiry loaded. Share link available while the combined report is checked.";
  }

  return "BYDA historical enquiry loaded.";
}

async function safelyResolve(work) {
  try {
    return await work();
  } catch {
    return null;
  }
}

function toTimestamp(value) {
  return Number.isFinite(Date.parse(value ?? "")) ? Date.parse(value) : 0;
}

const STREET_TYPE_ALIASES = {
  ALY: "ALLEY",
  ARC: "ARCADE",
  AV: "AVENUE",
  AVE: "AVENUE",
  BVD: "BOULEVARD",
  CL: "CLOSE",
  CRT: "COURT",
  CT: "COURT",
  CRES: "CRESCENT",
  DR: "DRIVE",
  HWY: "HIGHWAY",
  LN: "LANE",
  PDE: "PARADE",
  PL: "PLACE",
  PKWY: "PARKWAY",
  RD: "ROAD",
  SQ: "SQUARE",
  ST: "STREET",
  TCE: "TERRACE",
};

function matchesLocalRecordAddress(record, address) {
  const target = normalizeStructuredAddress(address);

  return [
    record?.input?.address,
    record?.site?.address,
  ]
    .filter(Boolean)
    .some((candidate) => matchesNormalizedAddress(normalizeStructuredAddress(candidate), target));
}

function matchesRemoteRecordAddress(record, address) {
  return matchesNormalizedAddress(
    normalizeBydaAddress(record?.address),
    normalizeStructuredAddress(address),
  );
}

function matchesNormalizedAddress(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.streetNumber === right.streetNumber &&
    left.streetName === right.streetName &&
    left.suburb === right.suburb &&
    left.state === right.state &&
    left.postcode === right.postcode
  );
}

function normalizeStructuredAddress(address) {
  if (!address) {
    return null;
  }

  return {
    streetNumber: normalizeStreetNumber(address.streetNumber),
    streetName: normalizeStreetName(address.streetName),
    suburb: normalizeTokenSequence(address.suburb),
    state: normalizeTokenSequence(address.state),
    postcode: normalizePostcode(address.postcode),
  };
}

function normalizeBydaAddress(address) {
  if (!address) {
    return null;
  }

  const line1 = String(address.line1 ?? "").trim();
  const match = line1.match(/^([0-9A-Z/-]+)\s+(.+)$/i);

  return {
    streetNumber: normalizeStreetNumber(match?.[1] ?? ""),
    streetName: normalizeStreetName(match?.[2] ?? line1),
    suburb: normalizeTokenSequence(address.locality),
    state: normalizeTokenSequence(address.state),
    postcode: normalizePostcode(address.postcode),
  };
}

function normalizeStreetNumber(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeStreetName(value) {
  return tokenizeWords(value)
    .map((token) => STREET_TYPE_ALIASES[token] ?? token)
    .join(" ");
}

function normalizeTokenSequence(value) {
  return tokenizeWords(value).join(" ");
}

function normalizePostcode(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 4);
}

function tokenizeWords(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
