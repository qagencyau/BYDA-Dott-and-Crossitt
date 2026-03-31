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
    switch (site.state) {
      case "NSW":
        return this.nsw.enrich(site).catch(() => site);
      case "QLD":
        return this.qld.enrich(site).catch(() => site);
      case "VIC":
        return this.vic.enrich(site).catch(() => site);
      default:
        return assertNever(site.state);
    }
  }
}

function assertNever(value) {
  throw new Error(`Unsupported state: ${value}`);
}
