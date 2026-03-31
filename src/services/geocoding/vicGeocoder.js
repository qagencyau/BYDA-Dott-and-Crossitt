import { createBufferedSquare, polygonFromArcGisRings } from "../../lib/geo.js";
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
const VIC_PARCEL_QUERY_URL =
  "https://spatial.planning.vic.gov.au/gis/rest/services/property_and_parcel/MapServer/4/query";

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

    const sites = (response.features ?? [])
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

  async enrich(site) {
    if (!site.point) {
      return site;
    }

    const response = await fetchJson(
      buildUrl(VIC_PARCEL_QUERY_URL, {
        where: "1=1",
        geometry: JSON.stringify({
          x: site.point.lng,
          y: site.point.lat,
          spatialReference: { wkid: 4326 },
        }),
        geometryType: "esriGeometryPoint",
        inSR: 4326,
        spatialRel: "esriSpatialRelIntersects",
        outFields: "PARCEL_PFI,PARCEL_SPI,PARCEL_PLAN_NUMBER,PARCEL_LOT_NUMBER",
        returnGeometry: true,
        geometryPrecision: 6,
        outSR: 4326,
        resultRecordCount: 1,
        f: "json",
      }),
    );

    const feature = response.features?.[0];
    const polygon = feature?.geometry
      ? polygonFromArcGisRings(feature.geometry.rings)
      : null;

    if (!polygon) {
      return site;
    }

    return {
      ...site,
      polygon,
      source: "VIC Cadastral parcel",
      metadata: {
        ...site.metadata,
        parcelPfi: feature.attributes?.PARCEL_PFI ?? null,
        parcelSpi: feature.attributes?.PARCEL_SPI ?? null,
        parcelPlanNumber: feature.attributes?.PARCEL_PLAN_NUMBER ?? null,
        parcelLotNumber: feature.attributes?.PARCEL_LOT_NUMBER ?? null,
      },
    };
  }
}
