import { createBufferedSquare } from "../../lib/geo.js";
import { buildUrl, fetchJson } from "../../lib/http.js";
import {
  dedupeSites,
  escapeSqlLiteral,
  normalizeUpper,
  parseStreetInput,
  rankAddressCandidate,
} from "./helpers.js";

const VIC_QUERY_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Address/FeatureServer/0/query";

export class VicGeocoder {
  constructor(bufferMeters) {
    this.bufferMeters = bufferMeters;
  }

  async search(address) {
    const street = parseStreetInput(address.streetName);
    const clauses = [
      `house_number_1 = ${Number(address.streetNumber)}`,
      `road_name like '${escapeSqlLiteral(street.roadName)}%'`,
      `locality_name = '${escapeSqlLiteral(normalizeUpper(address.suburb))}'`,
      `postcode = '${escapeSqlLiteral(address.postcode)}'`,
    ];

    const response = await fetchJson(
      buildUrl(VIC_QUERY_URL, {
        where: clauses.join(" and "),
        outFields: "ezi_address,postcode,locality_name,road_type",
        returnGeometry: true,
        outSR: 4326,
        resultRecordCount: 10,
        f: "json",
      }),
    );

    const sites = response.features
      .flatMap((feature) => {
        if (!feature.geometry) {
          return [];
        }

        const point = {
          lat: feature.geometry.y,
          lng: feature.geometry.x,
        };

        return [{
          id: `vic:${feature.attributes.ezi_address}`,
          label: feature.attributes.ezi_address,
          state: "VIC",
          address,
          point,
          polygon: createBufferedSquare(point, this.bufferMeters),
          source: "Vicmap Address",
        }];
      })
      .sort(
        (left, right) =>
          rankAddressCandidate(address, right.label) - rankAddressCandidate(address, left.label),
      );

    return dedupeSites(sites);
  }
}
