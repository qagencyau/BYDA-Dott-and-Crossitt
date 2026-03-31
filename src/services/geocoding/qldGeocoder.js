import { createBufferedSquare, polygonFromArcGisRings } from "../../lib/geo.js";
import { buildUrl, fetchJson } from "../../lib/http.js";
import {
  dedupeSites,
  escapeSqlLiteral,
  normalizeTitle,
  parseStreetInput,
  rankAddressCandidate,
} from "./helpers.js";

const QLD_ADDRESS_QUERY_URL =
  "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/0/query";
const QLD_PARCEL_QUERY_URL =
  "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4/query";

export class QldGeocoder {
  constructor(bufferMeters) {
    this.bufferMeters = bufferMeters;
  }

  async search(address) {
    const street = parseStreetInput(address.streetName);
    const clauses = [
      `street_number = '${escapeSqlLiteral(address.streetNumber.trim())}'`,
      `street_name = '${escapeSqlLiteral(normalizeTitle(street.roadName))}'`,
      `locality = '${escapeSqlLiteral(normalizeTitle(address.suburb))}'`,
    ];

    if (street.roadType) {
      clauses.push(`street_type = '${escapeSqlLiteral(normalizeTitle(street.roadType))}'`);
    }

    const response = await fetchJson(
      buildUrl(QLD_ADDRESS_QUERY_URL, {
        where: clauses.join(" and "),
        outFields: "address,lotplan,latitude,longitude",
        returnGeometry: true,
        outSR: 4326,
        resultRecordCount: 10,
        f: "json",
      }),
    );

    const ranked = (response.features ?? [])
      .flatMap((feature) => {
        if (!feature.geometry) {
          return [];
        }

        const point = {
          lat: feature.geometry.y,
          lng: feature.geometry.x,
        };

        return [{
          id: `qld:${feature.attributes.lotplan}`,
          label: feature.attributes.address,
          state: "QLD",
          address,
          point,
          polygon: createBufferedSquare(point, this.bufferMeters),
          source: "QLD Addresses",
          metadata: {
            lotplan: feature.attributes.lotplan,
          },
        }];
      })
      .sort(
        (left, right) =>
          rankAddressCandidate(address, right.label) - rankAddressCandidate(address, left.label),
      );

    return dedupeSites(ranked);
  }

  async enrich(site) {
    const lotplan = site.metadata?.lotplan;

    if (!lotplan || typeof lotplan !== "string" || lotplan.startsWith("9999")) {
      return site;
    }

    const response = await fetchJson(
      buildUrl(QLD_PARCEL_QUERY_URL, {
        where: `lotplan = '${escapeSqlLiteral(lotplan)}'`,
        outFields: "lotplan",
        returnGeometry: true,
        geometryPrecision: 6,
        outSR: 4326,
        resultRecordCount: 1,
        f: "json",
      }),
    );

    const polygon = response.features[0]?.geometry
      ? polygonFromArcGisRings(response.features[0].geometry.rings)
      : null;

    if (!polygon) {
      return site;
    }

    return {
      ...site,
      polygon,
      source: "QLD Cadastral parcel",
    };
  }
}
