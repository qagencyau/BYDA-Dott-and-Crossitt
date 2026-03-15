import { randomUUID } from "node:crypto";

const STREET_TYPE_ALIASES = new Map([
  ["ST", "STREET"],
  ["STREET", "STREET"],
  ["RD", "ROAD"],
  ["ROAD", "ROAD"],
  ["AVE", "AVENUE"],
  ["AVENUE", "AVENUE"],
  ["BLVD", "BOULEVARD"],
  ["BOULEVARD", "BOULEVARD"],
  ["DR", "DRIVE"],
  ["DRIVE", "DRIVE"],
  ["CT", "COURT"],
  ["COURT", "COURT"],
  ["PL", "PLACE"],
  ["PLACE", "PLACE"],
  ["HWY", "HIGHWAY"],
  ["HIGHWAY", "HIGHWAY"],
  ["PDE", "PARADE"],
  ["PARADE", "PARADE"],
  ["TCE", "TERRACE"],
  ["TERRACE", "TERRACE"],
  ["CRES", "CRESCENT"],
  ["CRESCENT", "CRESCENT"],
  ["WAY", "WAY"],
  ["LN", "LANE"],
  ["LANE", "LANE"],
]);

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeUpper(value) {
  return normalizeWhitespace(value).toUpperCase();
}

export function normalizeTitle(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function escapeSqlLiteral(value) {
  return value.replace(/'/g, "''");
}

export function parseStreetInput(value) {
  const normalized = normalizeUpper(value);
  const parts = normalized.split(" ");
  const lastPart = parts[parts.length - 1];
  const roadType = STREET_TYPE_ALIASES.get(lastPart);

  if (!roadType) {
    return {
      raw: value,
      normalized,
      roadName: normalized,
    };
  }

  return {
    raw: value,
    normalized,
    roadName: parts.slice(0, -1).join(" "),
    roadType,
  };
}

function normalizeForComparison(value) {
  return normalizeUpper(value).replace(/[^A-Z0-9 ]/g, "");
}

export function rankAddressCandidate(input, label) {
  const normalizedLabel = normalizeForComparison(label);
  const normalizedStreetName = normalizeForComparison(input.streetName);
  const normalizedSuburb = normalizeForComparison(input.suburb);
  let score = 0;

  if (normalizedLabel.includes(normalizeForComparison(input.streetNumber))) {
    score += 3;
  }

  if (normalizedLabel.includes(normalizedStreetName)) {
    score += 4;
  }

  if (normalizedLabel.includes(normalizedSuburb)) {
    score += 3;
  }

  if (normalizedLabel.includes(input.postcode)) {
    score += 2;
  }

  if (normalizedLabel.startsWith(`${normalizeForComparison(input.streetNumber)} ${normalizedStreetName}`)) {
    score += 5;
  }

  return score;
}

export function dedupeSites(sites) {
  const seen = new Set();
  const deduped = [];

  for (const site of sites) {
    const key = `${site.label}|${site.point.lat.toFixed(6)}|${site.point.lng.toFixed(6)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      ...site,
      id: site.id || randomUUID(),
    });
  }

  return deduped;
}
