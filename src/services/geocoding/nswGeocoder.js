import { createBufferedSquare } from "../../lib/geo.js";
import { buildUrl, fetchJson } from "../../lib/http.js";
import {
  dedupeSites,
  escapeSqlLiteral,
  normalizeUpper,
  parseStreetInput,
  rankAddressCandidate,
} from "./helpers.js";

const NSW_POINT_URL =
  "https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Geocoded_Addressing_Theme/FeatureServer/1/query";

export class NswGeocoder {
  constructor(bufferMeters) {
    this.bufferMeters = bufferMeters;
  }

  async search(address) {
    const street = parseStreetInput(address.streetName);
    const points = await fetchJson(
      buildUrl(NSW_POINT_URL, {
        where: [
          `housenumber = '${escapeSqlLiteral(normalizeUpper(address.streetNumber))}'`,
          `address like '%${escapeSqlLiteral(street.roadName)}%'`,
        ].join(" and "),
        outFields: "gurasid,address",
        returnGeometry: true,
        outSR: 4326,
        resultRecordCount: 20,
        f: "json",
      }),
    );

    const rankedSites = points.features
      .flatMap((feature) => {
        if (!feature.geometry) {
          return [];
        }

        const point = {
          lat: feature.geometry.y,
          lng: feature.geometry.x,
        };

        return [{
          id: `nsw:${feature.attributes.gurasid}`,
          label: feature.attributes.address,
          state: "NSW",
          address,
          point,
          polygon: createBufferedSquare(point, this.bufferMeters),
          source: "NSW AddressPoint",
          metadata: {
            gurasid: feature.attributes.gurasid,
          },
        }];
      })
      .sort(
        (left, right) =>
          rankAddressCandidate(address, right.label) - rankAddressCandidate(address, left.label),
      );

    const suburbMatches = rankedSites.filter((site) =>
      normalizeUpper(site.label).includes(normalizeUpper(address.suburb)),
    );

    return dedupeSites(suburbMatches.length ? suburbMatches : rankedSites);
  }
}
