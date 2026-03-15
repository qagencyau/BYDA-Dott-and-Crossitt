import { NswGeocoder } from "./nswGeocoder.js";
import { QldGeocoder } from "./qldGeocoder.js";
import { VicGeocoder } from "./vicGeocoder.js";

export class GeocodingService {
  constructor(bufferMeters) {
    this.nsw = new NswGeocoder(bufferMeters);
    this.qld = new QldGeocoder(bufferMeters);
    this.vic = new VicGeocoder(bufferMeters);
  }

  async search(address) {
    switch (address.state) {
      case "NSW":
        return this.nsw.search(address);
      case "QLD":
        return this.qld.search(address);
      case "VIC":
        return this.vic.search(address);
      default:
        return assertNever(address.state);
    }
  }

  async enrich(site) {
    if (site.state !== "QLD") {
      return site;
    }

    return this.qld.enrich(site);
  }
}

function assertNever(value) {
  throw new Error(`Unsupported state: ${value}`);
}
