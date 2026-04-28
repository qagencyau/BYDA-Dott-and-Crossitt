const DEFAULT_STEPS = ["Find Location", "Enquiry Details", "Track Enquiry"];
const DEFAULT_DETAILS = [
  "Enter the address details and choose the best match.",
  "Add your dates and any extra details you want included.",
  "Keep your reference number handy and open the report when it is ready.",
];
const LOCATION_TYPES = ["Private", "Road Reserve"];
const ROAD_LOCATION_OPTIONS = ["Road", "Nature Strip", "Footpath"];
const STATE_OPTIONS = ["NSW", "QLD", "VIC"];
const DEFAULT_VALUE = {
  address: {
    streetNumber: "",
    streetName: "",
    suburb: "",
    state: "",
    postcode: "",
  },
  enquiry: {
    digStartAt: "",
    digEndAt: "",
    userReference: "",
    isPlanning: true,
    activityType: "",
    locationType: LOCATION_TYPES[0],
    roadLocation: ROAD_LOCATION_OPTIONS[0],
    authorityId: "",
    otherAuthorityName: "",
    notes: "",
  },
  candidates: [],
  existingEnquiries: [],
  selectedSite: null,
  selectedExistingEnquiry: null,
  tracking: {
    status: "Draft",
    displayStatus: "Draft",
    bydaStatus: "NOT_STARTED",
    token: "",
    enquiryId: null,
    readyUrl: "",
    message: "",
    completedAt: "",
    updatedAt: "",
  },
  submitted: false,
};
const USER_COPY = {
  defaults: {
    heading: "Enquiry form",
  },
  buttons: {
    back: "Back",
    continue: "Continue",
    restart: "Start again",
    choose: "Use This Site",
    chosen: "Selected",
    use: "Use",
    finish: "Create Reference",
  },
  chrome: {
    count: (step, total) => `Step ${step} of ${total}`,
  },
  notices: {
    reset: "You can start again at any time.",
    searchShort: "Enter street number, street name, suburb, state, and postcode to search.",
    datesNeeded: "Add your start and end dates to continue.",
    locationSelected: "Location selected.",
    referenceReady: "Reference number created.",
    searchEmpty: "Enter street number, street name, suburb, state, and postcode to see matches.",
    searchNone: "Check the address details to see more matches.",
    optionsLoading: "Loading enquiry options.",
    optionsError: "Enquiry options could not be loaded.",
    authoritiesLoading: "Loading authorities for this location.",
    authoritiesError: "Authorities could not be loaded for this location.",
    createPending: "Creating the enquiry reference.",
  },
  search: {
    title: "Find the right location",
    copy: "Add the address details, then choose the best match from the list.",
    streetNumber: "Street number",
    streetName: "Street name",
    suburb: "Suburb",
    state: "State",
    postcode: "Postcode",
    streetNumberPlaceholder: "48",
    streetNamePlaceholder: "Pirrama Rd",
    suburbPlaceholder: "Pyrmont",
    postcodePlaceholder: "2009",
    helper: "Matches appear below once the address and state are entered.",
    resultLabel: "Match",
    selectedLabel: "Selected location",
  },
  details: {
    title: "Add enquiry details",
    copy: "Add your dates and any extra details you want included.",
    locationLabel: "Location",
    startDate: "Start date",
    endDate: "End date",
    yourReference: "Your reference",
    referenceHelp: "Added automatically.",
    authority: "Authority",
    manualAuthority: "Manual authority",
    manualAuthorityPlaceholder: "Only if not in the list",
    activityType: "Activity type",
    locationType: "Location type",
    roadLocation: "Road reserve location",
    planning: "Planning enquiry",
    planningHelp: "Turn this on if this enquiry is only for planning.",
    notes: "Notes",
    notesPlaceholder: "Add extra details if needed.",
  },
  review: {
    title: "Track enquiry",
    copy: "Keep your reference number and open the report when it is ready.",
    progress: "Progress",
    location: "Location",
    workDates: "Work dates",
    yourReference: "Your reference",
    status: "Status",
    referenceNumber: "Reference number",
    created: "Created",
    nextStep: "Next step",
    finishHelp: "This creates the reference number shown below.",
    nextBeforeFinish: "Check your details, then create your reference number.",
    nextAfterFinish: "Keep this reference number for your records.",
  },
  progress: {
    notStarted: {
      label: "Not started",
      percent: 0,
      detail: "Start by searching for a location.",
      status: "Not started",
    },
    searching: {
      label: "Searching",
      percent: 20,
      detail: "Choose the best match to continue.",
      status: "Searching",
    },
    locationSelected: {
      label: "Location selected",
      percent: 45,
      detail: "Add your dates to continue.",
      status: "Location selected",
    },
    ready: {
      label: "Ready",
      percent: 80,
      detail: "Your details are ready to submit.",
      status: "Ready to create",
    },
    complete: {
      label: "Complete",
      percent: 100,
      detail: "Your reference number is ready to use.",
      status: "Complete",
    },
  },
  existing: {
    title: "Past enquiries",
    copy: "Previous enquiries for the same address are shown with the matching search result.",
    prompt: "Past enquiries appear once enough address details are entered.",
    loading: "Loading past enquiries for this address.",
    loadError: "Past enquiries could not be loaded for this address.",
    none: "No existing enquiries were found for this address yet.",
    resultLabel: "Existing result",
    reference: "Reference",
    created: "Created",
    source: "Source",
    bydaStatus: "BYDA status",
  },
};

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host{--ink:#18261f;--muted:#5d6a63;--line:rgba(24,38,31,.12);--surface:rgba(255,255,255,.82);--accent:#bb5c2d;--accentStrong:#7d3213;--accentSoft:rgba(187,92,45,.14);--successSoft:rgba(45,141,98,.12);--successInk:#165138;--track:rgba(24,38,31,.14);display:block;color:var(--ink);font-family:"Space Grotesk","Segoe UI",sans-serif}
    *{box-sizing:border-box}
    .panel{border:1px solid var(--line);border-radius:28px;background:linear-gradient(155deg,rgba(255,255,255,.96),rgba(247,240,231,.88)),linear-gradient(120deg,var(--accentSoft),transparent 58%);box-shadow:0 24px 64px rgba(42,34,24,.16)}
    .frame{display:flex;flex-direction:column;gap:24px;padding:28px}
    .topline{display:flex;justify-content:space-between;gap:16px;align-items:center}
    .heading{margin:0;font-family:"Fraunces",Georgia,serif;font-size:clamp(1.55rem,2.6vw,2.2rem);line-height:1}
    .stage-kicker,.section-kicker,.debug-kicker,.field-label,.summary-label{margin:0;letter-spacing:.16em;text-transform:uppercase;font-size:.72rem;font-weight:700;color:var(--muted)}
    .stage-detail,.summary-help,.debug-copy{margin:0;color:var(--muted);line-height:1.6}
    .count,.candidate-badge{display:inline-flex;align-items:center;min-height:38px;padding:9px 14px;border-radius:999px;background:var(--accentSoft);color:var(--accentStrong);font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
    .stage-shell,.debug-shell{display:flex;flex-direction:column;gap:18px;padding:22px;border-radius:24px;background:var(--surface);border:1px solid rgba(24,38,31,.08)}
    .stage-head{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:start}
    .stage-index{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:18px;background:var(--accentSoft);color:var(--accentStrong);font-size:1.05rem;font-weight:700}
    .stage-title,.debug-heading{margin:0;font-size:clamp(1.1rem,2vw,1.7rem);font-weight:700;line-height:1.08}
    .notice,.selected-site,.field,.summary-card,.candidate-card,.empty-state,.history-card,.history-meta-item,.search-result,.search-history-item,.tracking-status-item{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:18px;border:1px solid rgba(24,38,31,.08);background:rgba(255,255,255,.8)}
    .notice[hidden],.debug-shell[hidden]{display:none}
    .notice.positive,.selected-site{background:rgba(45,141,98,.1);border-color:rgba(45,141,98,.16);color:var(--successInk)}
    .body,.candidate-list,.button-row,.history-section,.history-list,.search-results,.search-history-list,.tracking-status-list{display:flex;flex-direction:column;gap:18px}
    .form-grid,.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .wide{grid-column:1/-1}
    .control,.textarea{width:100%;min-height:48px;padding:12px 14px;border-radius:14px;border:1px solid rgba(24,38,31,.1);background:#fff;color:var(--ink);font:inherit;font-size:.96rem}
    .readonly-address{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .readonly-address-intro{grid-column:1/-1;margin:0;color:var(--muted);line-height:1.6}
    .readonly-field{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;padding:14px 16px;border-radius:18px;border:1px solid rgba(24,38,31,.08);background:rgba(255,255,255,.8)}
    .readonly-field.missing{background:rgba(194,82,74,.08);border-color:rgba(194,82,74,.16)}
    .readonly-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:rgba(45,141,98,.14);color:var(--successInk);font-weight:800;line-height:1}
    .readonly-field.missing .readonly-icon{background:rgba(194,82,74,.14);color:#7f241d}
    .readonly-value{display:block;margin-top:4px;font-weight:700;line-height:1.45;overflow-wrap:anywhere}
    .readonly-field.missing .readonly-value{color:#7f241d}
    .textarea{min-height:110px;resize:vertical}
    .toggle{display:flex;align-items:center;gap:10px;font-weight:600}
    .toggle input{width:18px;height:18px;accent-color:var(--accent)}
    .footer-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
    .button{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 18px;border-radius:999px;border:1px solid rgba(24,38,31,.1);background:rgba(24,38,31,.06);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
    .button:disabled{opacity:.45;cursor:not-allowed}
    .button.primary{background:linear-gradient(135deg,var(--accent),var(--accentStrong));border-color:transparent;color:#fff}
    .button.success{background:linear-gradient(135deg,#2d8d62,#165138);border-color:transparent;color:#fff}
    .candidate-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:12px}
    .candidate-card.active{border-color:rgba(187,92,45,.26);background:rgba(187,92,45,.08)}
    .candidate-badge{min-height:28px;padding:4px 10px;font-size:.76rem}
    .candidate-title,.summary-value,.history-title{font-weight:700;line-height:1.45;overflow-wrap:anywhere}
    .search-result{gap:14px}
    .search-result.active{border-color:rgba(187,92,45,.26);background:rgba(187,92,45,.08)}
    .search-result-head,.tracking-status-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .search-result-head .button{flex-shrink:0}
    .search-result-title,.tracking-status-value{display:block;font-weight:700;line-height:1.45;overflow-wrap:anywhere}
    .search-result-source,.search-result-copy,.tracking-status-copy{margin:0;color:var(--muted);line-height:1.6}
    .search-result-source{display:block}
    .search-result-history{display:flex;flex-direction:column;gap:12px;padding-top:14px;border-top:1px solid rgba(24,38,31,.08)}
    .search-history-list{gap:10px}
    .search-history-item{gap:8px;padding:12px 14px;background:rgba(255,255,255,.72)}
    .search-history-item.active{border-color:rgba(187,92,45,.26);background:rgba(187,92,45,.08)}
    .search-history-meta{display:flex;flex-wrap:wrap;gap:8px 12px;color:var(--muted);font-size:.92rem}
    .search-history-actions{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
    .history-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .history-card{gap:14px}
    .history-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .history-meta-item{padding:12px 14px;background:rgba(255,255,255,.72)}
    .history-status{display:inline-flex;align-items:center;min-height:32px;padding:6px 10px;border-radius:999px;background:rgba(24,38,31,.08);color:var(--ink);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .history-status[data-status="ready"]{background:rgba(45,141,98,.14);color:var(--successInk)}
    .history-status[data-status="processing"]{background:rgba(196,139,31,.16);color:#7a540a}
    .history-status[data-status="historical"]{background:rgba(61,122,142,.14);color:#214554}
    .status-media{display:inline-flex;align-items:center;justify-content:center;min-width:76px;min-height:76px;border-radius:22px;background:linear-gradient(135deg,var(--accent),var(--accentStrong));color:#fff;font-size:1rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .tracking-status-list{gap:12px}
    .tracking-status-item{gap:8px;padding:14px 16px;background:rgba(255,255,255,.72)}
    .progress-track{width:100%;height:10px;border-radius:999px;background:rgba(24,38,31,.1);overflow:hidden}
    .progress-fill{height:100%;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accentStrong));transition:width .22s ease}
    .payload{margin:0;padding:16px;border-radius:18px;background:#17211c;color:#f4efe6;font-family:"IBM Plex Mono","SFMono-Regular",Consolas,monospace;font-size:.82rem;line-height:1.65;overflow:auto;white-space:pre-wrap;word-break:break-word}
    code{font-family:"IBM Plex Mono","SFMono-Regular",Consolas,monospace}
    @media (max-width:900px){.form-grid,.summary-grid,.history-meta,.readonly-address{grid-template-columns:1fr}.readonly-address-intro{grid-column:auto}}
    @media (max-width:720px){.frame{padding:22px}.topline,.footer-actions,.search-result-head,.tracking-status-head{flex-direction:column;align-items:stretch}.stage-head{grid-template-columns:1fr}.button{width:100%}.candidate-card{grid-template-columns:1fr}}
  </style>
  <article class="panel">
    <div class="frame">
      <div class="topline">
        <h2 class="heading"></h2>
        <div class="count"></div>
      </div>
      <section class="stage-shell">
        <div class="stage-head">
          <div class="stage-index"></div>
          <div>
            <h3 class="stage-title"></h3>
            <p class="stage-detail"></p>
          </div>
        </div>
        <div class="notice" hidden></div>
        <div class="body"></div>
      </section>
      <div class="footer-actions">
        <button class="button previous" type="button" data-action="previous">Previous Stage</button>
        <button class="button primary next" type="button" data-action="next">Next Stage</button>
        <button class="button reset" type="button" data-action="reset">Reset</button>
      </div>
      <section class="debug-shell" hidden>
        <p class="debug-kicker">Debug Output</p>
        <h3 class="debug-heading">Live component state</h3>
        <p class="debug-copy">Use this when validating the component on its own. In a host page, listen for the custom events or read <code>element.value</code>.</p>
        <pre class="payload debug-output"></pre>
      </section>
    </div>
  </article>
`;

const cloneValue = (value) => JSON.parse(JSON.stringify(value));
const parseItems = (value) => String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
const parseInteger = (value, fallback) => { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : fallback; };
const getTrimmedAttribute = (element, name) => String(element.getAttribute(name) || "").trim();
const boolAttr = (value) => (value ? "disabled" : "");
const joinParts = (parts) => parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
function formatDateLabel(value) { if (!value) return "Not set"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-AU",{day:"2-digit",month:"short",year:"numeric"}).format(parsed); }
function formatDateTimeLabel(value) { if (!value) return ""; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-AU",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(parsed); }
function formatDateInputValue(value) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function formatWorkDatesLabel(startAt, endAt) {
  const start = startAt ? formatDateLabel(startAt) : "";
  const end = endAt ? formatDateLabel(endAt) : "";
  if (start && end) return `${start} -> ${end}`;
  return start || end || "Not available";
}
function getRelativeDate(offsetDays = 0) { const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + offsetDays); return value; }
function applyDefaultEnquiryDates(enquiry = {}) {
  if (!enquiry.digStartAt) enquiry.digStartAt = formatDateInputValue(getRelativeDate(0));
  if (!enquiry.digEndAt) enquiry.digEndAt = formatDateInputValue(getRelativeDate(1));
  return enquiry;
}
function getExistingEnquiryStatusLabel(enquiry = {}) {
  const displayStatus = String(enquiry.displayStatus || "").trim();
  const status = String(enquiry.status || "").trim();
  const bydaStatus = String(enquiry.bydaStatus || "").trim();
  const generic = ["processing", "polling", "started", "starting"];
  if (bydaStatus && generic.includes((displayStatus || status).toLowerCase())) return bydaStatus;
  return displayStatus || status || bydaStatus || "Unknown";
}
function getExistingEnquiryStatusKey(enquiry = {}) {
  return getExistingEnquiryStatusLabel(enquiry).toLowerCase();
}
function getAddressHistoryEndpoint(host) {
  return getTrimmedAttribute(host, "address-history-endpoint") || "/api/enquiries/by-address";
}
function getAddressSearchEndpoint(host) {
  return getTrimmedAttribute(host, "address-search-endpoint") || "/api/addresses/search";
}
function getOptionsEndpoint(host) {
  return getTrimmedAttribute(host, "options-endpoint") || "/api/options";
}
function getAuthoritiesEndpoint(host) {
  return getTrimmedAttribute(host, "authorities-endpoint") || "/api/organisations/search";
}
function getEnquiryCreateEndpoint(host) {
  return getTrimmedAttribute(host, "enquiry-create-endpoint") || "/api/enquiries";
}
function getEnquiryStatusEndpoint(host, token) {
  const base = getTrimmedAttribute(host, "enquiry-status-endpoint") || "/api/enquiries";
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(token)}`;
}
function getRemoteEnquiryStatusEndpoint(host, enquiryId) {
  const base = getTrimmedAttribute(host, "remote-enquiry-status-endpoint") || "/api/enquiries/byda";
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(enquiryId)}`;
}
function getPollIntervalMs(host) {
  const value = Number.parseInt(getTrimmedAttribute(host, "poll-interval-ms"), 10);
  return Number.isFinite(value) && value >= 1000 ? value : 5000;
}
function shouldAutoSearchPrefill(host) {
  const value = getTrimmedAttribute(host, "prefill-auto-search").toLowerCase();
  return value !== "false";
}
function componentDebugLog(host, message, meta = {}) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug(`[BYDA IET Component] ${message}`, {
    id: host?.id || "",
    currentStep: host?.currentStep || null,
    ...meta,
  });
}
function urlDebugSummary(value) {
  const raw = String(value || "").trim();
  if (!raw) return { present: false };
  try {
    const url = new URL(raw, window.location.href);
    return {
      present: true,
      host: url.host,
      pathname: url.pathname,
      hasQuery: Boolean(url.search),
      length: raw.length,
    };
  } catch {
    return { present: true, invalid: true, length: raw.length };
  }
}
async function fetchJsonForComponent(url, init) {
  const startedAt = performance.now();
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[BYDA IET Component] Fetch starting.", {
      url,
      method: init?.method || "GET",
      hasBody: Boolean(init?.body),
      bodyLength: init?.body ? String(init.body).length : 0,
    });
  }
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[BYDA IET Component] Fetch completed.", {
      url,
      method: init?.method || "GET",
      ok: response.ok,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
      statusPayload: payload && typeof payload === "object" ? {
        token: payload.token || payload.trackingToken || null,
        enquiryId: payload.enquiryId ?? null,
        status: payload.status || null,
        displayStatus: payload.displayStatus || null,
        bydaStatus: payload.bydaStatus || null,
        pollerStatus: payload.pollerStatus || null,
        hasReadyUrl: Boolean(payload.readyUrl),
        hasFileUrl: Boolean(payload.fileUrl),
        hasShareUrl: Boolean(payload.shareUrl),
        readyUrl: urlDebugSummary(payload.readyUrl),
        fileUrl: urlDebugSummary(payload.fileUrl),
        shareUrl: urlDebugSummary(payload.shareUrl),
        message: payload.message || null,
        error: payload.error || null,
      } : null,
    });
  }
  if (!response.ok) {
    const details = typeof payload.details === "string"
      ? payload.details
      : payload.details
        ? JSON.stringify(payload.details)
        : "";
    const requestId = payload.requestId ? ` Request ID: ${payload.requestId}.` : "";
    throw new Error(`${payload.error || "Request failed."}${details ? ` ${details}` : ""}${requestId}`.trim());
  }
  return payload;
}
function getTrackingTone(statusValue = "") {
  const normalized = String(statusValue || "").toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("reject")) return "critical";
  if (normalized.includes("pending") || normalized.includes("process") || normalized.includes("wait")) return "warning";
  if (normalized.includes("histor")) return "neutral";
  if (normalized.includes("ready") || normalized.includes("complete") || normalized.includes("received")) return "success";
  return "neutral";
}
function normalizeCandidate(site = {}) {
  const id = site.id || `${site.label || "site"}-${site.state || ""}`;
  const title = site.label || formatAddressLabel(site.address) || "Resolved address";
  return {
    id,
    title,
    source: site.source || "Resolved address",
    copy: "",
    resolvedSite: {
      ...site,
      id,
      label: site.label || title,
      title,
    },
  };
}
function normalizeExistingEnquiry(record = {}) {
  return {
    ...record,
    id:
      record.id ||
      record.trackingToken ||
      (record.enquiryId ? `enquiry-${record.enquiryId}` : "") ||
      [record.userReference, record.createdAt].filter(Boolean).join("-") ||
      `existing-${Date.now()}`,
    digStartAt: record.digStartAt || "",
    digEndAt: record.digEndAt || "",
  };
}
function getSiteDisplayLabel(site = {}) {
  return site.title || site.label || formatAddressLabel(site.address) || "";
}
function getAuthorityLabel(authority = {}) {
  return authority.organisationType ? `${authority.name} (${authority.organisationType})` : authority.name;
}
function buildAddressOnlySite(address = {}) {
  const label = formatAddressLabel(address);
  return {
    id: `address-only-${buildIdentifierPart(label, "ADDRESS")}`,
    label,
    title: label,
    source: "Entered address",
    address: { ...address },
    state: String(address.state || "").trim().toUpperCase(),
    addressOnly: true,
  };
}
function createInitialValue(input = {}) {
  const next = cloneValue(DEFAULT_VALUE);
  if (input.address && typeof input.address === "object") Object.assign(next.address, input.address);
  if (input.enquiry && typeof input.enquiry === "object") Object.assign(next.enquiry, input.enquiry);
  if (next.enquiry.authority && !next.enquiry.otherAuthorityName) next.enquiry.otherAuthorityName = next.enquiry.authority;
  if (input.tracking && typeof input.tracking === "object") Object.assign(next.tracking, input.tracking);
  if (Array.isArray(input.candidates)) next.candidates = input.candidates.map((candidate) => candidate.resolvedSite ? { ...candidate } : normalizeCandidate(candidate));
  if (Array.isArray(input.existingEnquiries)) next.existingEnquiries = input.existingEnquiries.map((enquiry) => normalizeExistingEnquiry(enquiry));
  if (input.selectedSite && typeof input.selectedSite === "object") next.selectedSite = { ...input.selectedSite };
  if (input.selectedExistingEnquiry && typeof input.selectedExistingEnquiry === "object") next.selectedExistingEnquiry = normalizeExistingEnquiry(input.selectedExistingEnquiry);
  applyDefaultEnquiryDates(next.enquiry);
  next.submitted = Boolean(input.submitted || next.selectedExistingEnquiry);
  return next;
}
function buildStageItems(host) {
  const titles = parseItems(host.getAttribute("steps"));
  const details = parseItems(host.getAttribute("details"));
  return DEFAULT_STEPS.map((title, index) => ({ title: titles[index] || title, detail: details[index] || DEFAULT_DETAILS[index] }));
}
function buildIdentifierPart(seed = "", fallback = "TEST") {
  const cleaned = String(seed || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
  return cleaned || fallback;
}
function generateUserReference(seed = "") {
  return `IET-REF-${buildIdentifierPart(seed, "JOB")}-${String(Date.now()).slice(-6)}`;
}
function formatAddressLabel(address = {}) {
  const streetLine = joinParts([address.streetNumber, address.streetName]);
  const localityLine = joinParts([address.suburb, address.state, address.postcode]);
  return [streetLine, localityLine].filter(Boolean).join(", ");
}
function hasAddressSearchInput(address = {}) {
  return Boolean(
    String(address.streetNumber || "").trim() &&
    String(address.streetName || "").trim().length >= 2 &&
    String(address.suburb || "").trim().length >= 2 &&
    STATE_OPTIONS.includes(String(address.state || "").trim().toUpperCase()) &&
    /^\d{4}$/.test(String(address.postcode || "").trim())
  );
}
function getAddressSeed(address = {}) {
  return formatAddressLabel(address) || String(address.searchText || "").trim();
}

function compareIsoDates(left, right) {
  const leftTime = Number.isFinite(Date.parse(left || "")) ? Date.parse(left) : 0;
  const rightTime = Number.isFinite(Date.parse(right || "")) ? Date.parse(right) : 0;
  return leftTime - rightTime;
}

function formatExistingSource(source) {
  switch (source) {
    case "both":
      return "Local + BYDA";
    case "byda":
      return "BYDA";
    default:
      return "Local";
  }
}

function formatExistingReference(enquiry) {
  if (enquiry.userReference) return enquiry.userReference;
  if (enquiry.trackingToken) return enquiry.trackingToken;
  if (enquiry.enquiryId) return `BYDA enquiry ${enquiry.enquiryId}`;
  return "Saved enquiry";
}

export class BydaProcessSteps extends HTMLElement {
  static tagName = "byda-process-steps";
  static observedAttributes = ["current-step", "debug", "details", "heading", "next-label", "previous-label", "readonly-address", "steps"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.stepIndex = 0;
    this.state = createInitialValue();
    this.notice = "";
    this.noticeTone = "neutral";
    this.syncingAttribute = false;
    this.candidatesLoading = false;
    this.candidatesError = "";
    this.existingEnquiriesLoading = false;
    this.existingEnquiriesError = "";
    this.addressResultsRequestId = 0;
    this.addressResultsAbortController = null;
    this.addressResultsDebounce = null;
    this.addressResultsKey = "";
    this.optionsData = null;
    this.optionsLoading = false;
    this.optionsError = "";
    this.authorities = [];
    this.authoritiesLoading = false;
    this.authoritiesError = "";
    this.submissionLoading = false;
    this.statusPollHandle = null;
    this.statusRequestAbortController = null;
    this.elements = {
      heading: this.shadowRoot.querySelector(".heading"),
      count: this.shadowRoot.querySelector(".count"),
      stageIndex: this.shadowRoot.querySelector(".stage-index"),
      stageTitle: this.shadowRoot.querySelector(".stage-title"),
      stageDetail: this.shadowRoot.querySelector(".stage-detail"),
      notice: this.shadowRoot.querySelector(".notice"),
      body: this.shadowRoot.querySelector(".body"),
      previous: this.shadowRoot.querySelector(".previous"),
      next: this.shadowRoot.querySelector(".next"),
      debugShell: this.shadowRoot.querySelector(".debug-shell"),
      debugOutput: this.shadowRoot.querySelector(".debug-output"),
    };
    this.handleClick = this.handleClick.bind(this);
    this.handleFieldChange = this.handleFieldChange.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.addEventListener("click", this.handleClick);
    this.shadowRoot.addEventListener("input", this.handleFieldChange);
    this.shadowRoot.addEventListener("change", this.handleFieldChange);
    this.syncStepFromAttributes();
    void this.loadOptions();
    if (this.state.selectedSite && !this.state.selectedExistingEnquiry) void this.loadAuthorities(this.state.selectedSite);
    if (
      shouldAutoSearchPrefill(this)
      && this.canGenerateCandidates()
      && (!this.state.candidates.length || !this.state.existingEnquiries.length)
    ) this.scheduleAddressResultsRefresh({ immediate: true });
    if (this.state.submitted) void this.resumeTrackingState();
    this.render();
  }

  disconnectedCallback() {
    this.cancelAddressResultsRefresh();
    this.stopStatusPolling();
    if (this.statusRequestAbortController) {
      this.statusRequestAbortController.abort();
      this.statusRequestAbortController = null;
    }
    this.shadowRoot.removeEventListener("click", this.handleClick);
    this.shadowRoot.removeEventListener("input", this.handleFieldChange);
    this.shadowRoot.removeEventListener("change", this.handleFieldChange);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || this.syncingAttribute) return;
    if (name === "current-step") this.syncStepFromAttributes();
    this.render();
  }

  get currentStep() { return this.stepIndex + 1; }
  set currentStep(nextStep) { this.goToStep(nextStep); }
  get value() { return cloneValue(this.buildEventPayload()); }
  set value(nextValue) {
    this.cancelAddressResultsRefresh();
    this.stopStatusPolling();
    this.cancelStatusRequest();
    this.state = createInitialValue(nextValue);
    this.addressResultsKey = (this.state.candidates.length || this.state.existingEnquiries.length) ? this.getAddressResultsKey() : "";
    this.notice = "";
    this.noticeTone = "neutral";
    this.candidatesError = "";
    this.candidatesLoading = false;
    this.existingEnquiriesError = "";
    this.existingEnquiriesLoading = false;
    this.authorities = [];
    this.authoritiesError = "";
    this.authoritiesLoading = false;
    this.submissionLoading = false;
    if (
      this.isConnected
      && shouldAutoSearchPrefill(this)
      && this.canGenerateCandidates()
      && (!this.state.candidates.length || !this.state.existingEnquiries.length)
    ) this.scheduleAddressResultsRefresh({ immediate: true });
    if (this.isConnected && this.state.selectedSite && !this.state.selectedExistingEnquiry) void this.loadAuthorities(this.state.selectedSite);
    if (this.isConnected && this.state.submitted) void this.resumeTrackingState();
    if (this.isConnected) this.render();
  }

  reset() { this.cancelAddressResultsRefresh(); this.stopStatusPolling(); this.cancelStatusRequest(); this.state = createInitialValue(); this.addressResultsKey = ""; this.notice = USER_COPY.notices.reset; this.noticeTone = "neutral"; this.candidatesError = ""; this.candidatesLoading = false; this.existingEnquiriesError = ""; this.existingEnquiriesLoading = false; this.authorities = []; this.authoritiesError = ""; this.authoritiesLoading = false; this.submissionLoading = false; this.setStepIndex(0, { emitEvent: true, reason: "reset" }); this.emitComponentEvent("byda-process-change", { reason: "reset" }); }
  goToStep(nextStep) { this.setStepIndex(parseInteger(nextStep, 1) - 1, { emitEvent: true, reason: "programmatic" }); }
  canGenerateCandidates() { return hasAddressSearchInput(this.state.address); }
  getAddressResultsKey() { return JSON.stringify({ streetNumber: String(this.state.address.streetNumber || "").trim().toUpperCase(), streetName: String(this.state.address.streetName || "").trim().toUpperCase(), suburb: String(this.state.address.suburb || "").trim().toUpperCase(), state: String(this.state.address.state || "").trim().toUpperCase(), postcode: String(this.state.address.postcode || "").replace(/\D/g, "").slice(0, 4) }); }
  refreshAddressResults({ immediate = false, force = false } = {}) {
    if (!this.canGenerateCandidates()) {
      this.scheduleAddressResultsRefresh({ immediate });
      return false;
    }
    if (!force && (this.candidatesLoading || this.existingEnquiriesLoading || this.addressResultsDebounce || this.addressResultsKey === this.getAddressResultsKey())) {
      return false;
    }
    this.scheduleAddressResultsRefresh({ immediate });
    return true;
  }
  isAddressReadonly() { return this.hasAttribute("readonly-address"); }
  isStepOneComplete() { return Boolean(this.state.selectedSite); }
  isStepTwoComplete() { const e = this.state.enquiry; return Boolean(this.isStepOneComplete() && e.digStartAt && e.digEndAt && e.activityType && e.locationType && (e.locationType !== "Road Reserve" || e.roadLocation)); }
  isStepThreeComplete() { return Boolean(this.state.submitted); }
  canAdvance() { return this.stepIndex === 0 ? this.isStepOneComplete() : this.stepIndex === 1 ? this.isStepTwoComplete() : false; }
  ensureAutoUserReference() {
    if (this.state.enquiry.userReference) return;
    this.state.enquiry.userReference = generateUserReference(this.state.selectedSite?.id || getAddressSeed(this.state.address));
  }
  ensureEnquiryDefaults() {
    this.state.enquiry.isPlanning = true;
    applyDefaultEnquiryDates(this.state.enquiry);
    const activityOptions = this.getActivityOptions();
    const locationTypes = this.optionsData?.locationTypes?.length ? this.optionsData.locationTypes : LOCATION_TYPES;
    const roadLocations = this.optionsData?.locationsInRoad?.length ? this.optionsData.locationsInRoad : ROAD_LOCATION_OPTIONS;
    if (!locationTypes.includes(this.state.enquiry.locationType)) this.state.enquiry.locationType = locationTypes[0] || LOCATION_TYPES[0];
    if (!roadLocations.includes(this.state.enquiry.roadLocation)) this.state.enquiry.roadLocation = roadLocations[0] || ROAD_LOCATION_OPTIONS[0];
    if (activityOptions.length && !activityOptions.some((option) => option.code === this.state.enquiry.activityType)) {
      this.state.enquiry.activityType = activityOptions[0].code;
    }
    if (this.state.selectedSite && !this.state.selectedExistingEnquiry) this.ensureAutoUserReference();
  }
  getActivityOptions() {
    const nextOptions = this.optionsData?.planningActivityTypes;
    return Array.isArray(nextOptions) ? nextOptions : [];
  }
  getEnquiryProgress() {
    if (this.state.submitted) {
      const submittedStatus = String(this.state.tracking.displayStatus || this.state.tracking.status || this.state.tracking.bydaStatus || "").toLowerCase();
      if (submittedStatus.includes("ready") || submittedStatus.includes("complete") || submittedStatus.includes("received")) {
        return USER_COPY.progress.complete;
      }
      return {
        label: this.state.tracking.displayStatus || this.state.tracking.status || "Submitted",
        percent: 92,
        detail: this.state.tracking.message || "Your enquiry has been submitted and is being processed.",
        status: this.state.tracking.displayStatus || this.state.tracking.status || "Submitted",
      };
    }
    if (this.isStepTwoComplete()) return USER_COPY.progress.ready;
    if (this.isStepOneComplete()) return USER_COPY.progress.locationSelected;
    if (this.canGenerateCandidates()) return USER_COPY.progress.searching;
    return USER_COPY.progress.notStarted;
  }
  async loadOptions() {
    this.optionsLoading = true;
    this.optionsError = "";
    this.render();
    try {
      this.optionsData = await fetchJsonForComponent(getOptionsEndpoint(this));
      this.optionsLoading = false;
      this.optionsError = "";
      this.ensureEnquiryDefaults();
      this.render();
      this.emitComponentEvent("byda-process-change", { reason: "options-loaded" });
    } catch (error) {
      this.optionsLoading = false;
      this.optionsError = error instanceof Error ? error.message : USER_COPY.notices.optionsError;
      this.render();
    }
  }
  async loadAuthorities(site) {
    if (!site) {
      this.authorities = [];
      this.authoritiesError = "";
      this.authoritiesLoading = false;
      return;
    }
    this.authoritiesLoading = true;
    this.authoritiesError = "";
    this.authorities = [];
    this.render();
    try {
      const payload = await fetchJsonForComponent(getAuthoritiesEndpoint(this), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolvedSite: site }),
      });
      this.authorities = Array.isArray(payload.organisations) ? payload.organisations : [];
      this.authoritiesLoading = false;
      this.authoritiesError = "";
      if (!this.authorities.some((authority) => String(authority.id) === String(this.state.enquiry.authorityId || ""))) {
        this.state.enquiry.authorityId = "";
      }
      this.render();
    } catch (error) {
      this.authorities = [];
      this.authoritiesLoading = false;
      this.authoritiesError = error instanceof Error ? error.message : USER_COPY.notices.authoritiesError;
      this.render();
    }
  }
  cancelAddressResultsRefresh() {
    if (this.addressResultsDebounce) {
      clearTimeout(this.addressResultsDebounce);
      this.addressResultsDebounce = null;
    }
    if (this.addressResultsAbortController) {
      this.addressResultsAbortController.abort();
      this.addressResultsAbortController = null;
    }
  }
  scheduleAddressResultsRefresh({ immediate = false } = {}) {
    this.cancelAddressResultsRefresh();
    if (!this.canGenerateCandidates()) {
      this.candidatesLoading = false;
      this.candidatesError = "";
      this.existingEnquiriesLoading = false;
      this.existingEnquiriesError = "";
      this.state.candidates = [];
      this.state.existingEnquiries = [];
      this.addressResultsKey = "";
      return;
    }
    const runRefresh = () => {
      this.addressResultsDebounce = null;
      void this.loadAddressResults();
    };
    if (immediate) {
      runRefresh();
      return;
    }
    this.addressResultsDebounce = setTimeout(runRefresh, 250);
  }
  async loadAddressResults() {
    if (!this.canGenerateCandidates()) return;
    const requestId = ++this.addressResultsRequestId;
    const addressResultsKey = this.getAddressResultsKey();
    this.addressResultsAbortController = new AbortController();
    this.candidatesLoading = true;
    this.candidatesError = "";
    this.existingEnquiriesLoading = true;
    this.existingEnquiriesError = "";
    this.state.candidates = [];
    this.state.existingEnquiries = [];
    this.render();
    const params = new URLSearchParams({
      streetNumber: this.state.address.streetNumber,
      streetName: this.state.address.streetName,
      suburb: this.state.address.suburb,
      state: this.state.address.state,
      postcode: this.state.address.postcode,
      limit: "6",
      source: "all",
    });
    try {
      const [candidatesResult, historyResult] = await Promise.allSettled([
        fetchJsonForComponent(`${getAddressSearchEndpoint(this)}?${params.toString()}`, {
          signal: this.addressResultsAbortController.signal,
        }),
        fetchJsonForComponent(`${getAddressHistoryEndpoint(this)}?${params.toString()}`, {
          signal: this.addressResultsAbortController.signal,
        }),
      ]);
      if (requestId !== this.addressResultsRequestId) return;
      this.candidatesLoading = false;
      this.existingEnquiriesLoading = false;
      this.addressResultsKey = addressResultsKey;
      if (candidatesResult.status === "fulfilled") {
        this.state.candidates = Array.isArray(candidatesResult.value.sites)
          ? candidatesResult.value.sites.map((site) => normalizeCandidate(site))
          : [];
        this.candidatesError = "";
      } else {
        this.state.candidates = [];
        this.candidatesError = candidatesResult.reason instanceof Error ? candidatesResult.reason.message : USER_COPY.notices.searchNone;
      }
      if (historyResult.status === "fulfilled") {
        this.state.existingEnquiries = Array.isArray(historyResult.value.enquiries)
          ? historyResult.value.enquiries.map((enquiry) => normalizeExistingEnquiry(enquiry))
          : [];
        this.existingEnquiriesError = "";
      } else {
        this.state.existingEnquiries = [];
        this.existingEnquiriesError = historyResult.reason instanceof Error ? historyResult.reason.message : USER_COPY.existing.loadError;
      }
      this.render();
      this.emitComponentEvent("byda-process-change", { reason: "address-results-loaded" });
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== this.addressResultsRequestId) return;
      this.candidatesLoading = false;
      this.candidatesError = error instanceof Error ? error.message : USER_COPY.notices.searchNone;
      this.state.candidates = [];
      this.state.existingEnquiries = [];
      this.existingEnquiriesLoading = false;
      this.existingEnquiriesError = error instanceof Error ? error.message : USER_COPY.existing.loadError;
      this.render();
    } finally {
      if (requestId === this.addressResultsRequestId) this.addressResultsAbortController = null;
    }
  }
  cancelStatusRequest() {
    if (this.statusRequestAbortController) {
      this.statusRequestAbortController.abort();
      this.statusRequestAbortController = null;
    }
  }
  stopStatusPolling() {
    if (!this.statusPollHandle) return;
    clearInterval(this.statusPollHandle);
    this.statusPollHandle = null;
    componentDebugLog(this, "Status polling stopped.", {
      tracking: { ...this.state.tracking },
    });
  }
  startStatusPolling(target) {
    this.stopStatusPolling();
    componentDebugLog(this, "Status polling started.", {
      target,
      intervalMs: getPollIntervalMs(this),
      trackingBeforeStart: { ...this.state.tracking },
    });
    this.statusPollHandle = setInterval(() => {
      componentDebugLog(this, "Status poll tick.", {
        target,
        trackingBeforeRequest: { ...this.state.tracking },
      });
      const work = target.trackingToken
        ? this.loadTrackingStatus(target.trackingToken)
        : this.loadRemoteEnquiryStatus(target.enquiryId);
      work.catch((error) => {
        componentDebugLog(this, "Status poll tick failed.", {
          target,
          error: error instanceof Error ? error.message : String(error),
        });
        this.notice = error instanceof Error ? error.message : "Status polling failed.";
        this.noticeTone = "neutral";
        this.render();
        this.stopStatusPolling();
      });
    }, getPollIntervalMs(this));
  }
  applyStatusPayload(status) {
    componentDebugLog(this, "Applying status payload.", {
      previousTracking: { ...this.state.tracking },
      status: {
        token: status?.trackingToken || status?.token || null,
        enquiryId: status?.enquiryId ?? null,
        status: status?.status || null,
        displayStatus: status?.displayStatus || null,
        bydaStatus: status?.bydaStatus || null,
        pollerStatus: status?.pollerStatus || null,
        readyUrl: urlDebugSummary(status?.readyUrl),
        fileUrl: urlDebugSummary(status?.fileUrl),
        shareUrl: urlDebugSummary(status?.shareUrl),
        message: status?.message || null,
        error: status?.error || null,
        updatedAt: status?.updatedAt || null,
      },
    });
    const displayStatus = status.displayStatus || status.status || status.bydaStatus || "unknown";
    this.state.submitted = true;
    this.state.tracking.status = status.status || displayStatus;
    this.state.tracking.displayStatus = displayStatus;
    this.state.tracking.bydaStatus = status.bydaStatus || this.state.tracking.bydaStatus || "NOT_STARTED";
    this.state.tracking.token = status.trackingToken || status.token || this.state.tracking.token;
    this.state.tracking.enquiryId = status.enquiryId ?? this.state.tracking.enquiryId ?? null;
    this.state.tracking.readyUrl = status.readyUrl || "";
    this.state.tracking.message = status.message || "";
    this.state.tracking.completedAt = status.updatedAt || status.createdAt || this.state.tracking.completedAt || "";
    this.state.tracking.updatedAt = status.updatedAt || status.createdAt || "";
    if (status.userReference) this.state.enquiry.userReference = status.userReference;
    if (status.site) {
      this.state.selectedSite = { ...status.site };
    } else if (status.addressLabel && !this.state.selectedSite) {
      this.state.selectedSite = {
        id: `status-site-${status.enquiryId || this.state.tracking.token || buildIdentifierPart(status.addressLabel, "SITE")}`,
        label: status.addressLabel,
        title: status.addressLabel,
        source: status.source === "byda" ? "BYDA history" : "Tracked enquiry",
      };
    }
    if (this.state.selectedExistingEnquiry) {
      this.state.selectedExistingEnquiry = normalizeExistingEnquiry({
        ...this.state.selectedExistingEnquiry,
        ...status,
      });
    }
    const terminal = ["ready", "failed"].includes(String(status.status || "").toLowerCase());
    if (terminal) this.stopStatusPolling();
    this.render();
    componentDebugLog(this, "Status payload applied.", {
      terminal,
      nextTracking: { ...this.state.tracking },
    });
    return status;
  }
  async loadTrackingStatus(token) {
    this.cancelStatusRequest();
    this.statusRequestAbortController = new AbortController();
    componentDebugLog(this, "Loading local tracking status.", {
      token,
      endpoint: getEnquiryStatusEndpoint(this, token),
    });
    try {
      const status = await fetchJsonForComponent(getEnquiryStatusEndpoint(this, token), {
        signal: this.statusRequestAbortController.signal,
      });
      return this.applyStatusPayload(status);
    } finally {
      this.statusRequestAbortController = null;
      componentDebugLog(this, "Local tracking status request finished.", { token });
    }
  }
  async loadRemoteEnquiryStatus(enquiryId) {
    this.cancelStatusRequest();
    this.statusRequestAbortController = new AbortController();
    componentDebugLog(this, "Loading remote BYDA enquiry status.", {
      enquiryId,
      endpoint: getRemoteEnquiryStatusEndpoint(this, enquiryId),
    });
    try {
      const status = await fetchJsonForComponent(getRemoteEnquiryStatusEndpoint(this, enquiryId), {
        signal: this.statusRequestAbortController.signal,
      });
      return this.applyStatusPayload(status);
    } finally {
      this.statusRequestAbortController = null;
      componentDebugLog(this, "Remote BYDA enquiry status request finished.", { enquiryId });
    }
  }
  async resumeTrackingState() {
    componentDebugLog(this, "Resuming tracking state.", {
      tracking: { ...this.state.tracking },
    });
    try {
      let status = null;
      if (this.state.tracking.token) {
        status = await this.loadTrackingStatus(this.state.tracking.token);
      } else if (this.state.tracking.enquiryId) {
        status = await this.loadRemoteEnquiryStatus(this.state.tracking.enquiryId);
      } else {
        this.render();
        componentDebugLog(this, "No tracking token or enquiry ID available during resume.", {
          tracking: { ...this.state.tracking },
        });
        return;
      }
      const nextToken = status?.trackingToken || this.state.tracking.token;
      const nextEnquiryId = status?.enquiryId ?? this.state.tracking.enquiryId;
      componentDebugLog(this, "Tracking resume loaded status.", {
        status,
        nextToken,
        nextEnquiryId,
      });
      if (status && !["ready", "failed"].includes(String(status.status || "").toLowerCase())) {
        if (nextToken) this.startStatusPolling({ trackingToken: nextToken });
        else if (nextEnquiryId) this.startStatusPolling({ enquiryId: nextEnquiryId });
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      componentDebugLog(this, "Tracking resume failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.notice = error instanceof Error ? error.message : "Tracking status could not be loaded.";
      this.noticeTone = "neutral";
      this.render();
    }
  }
  syncAddressResults() {
    this.stopStatusPolling();
    this.cancelStatusRequest();
    this.addressResultsKey = "";
    this.state.candidates = [];
    this.state.existingEnquiries = [];
    this.state.selectedSite = null;
    this.authorities = [];
    this.authoritiesError = "";
    this.authoritiesLoading = false;
    this.state.enquiry.userReference = "";
    this.setDraftTracking();
    this.scheduleAddressResultsRefresh();
  }

  syncStepFromAttributes() { this.stepIndex = Math.min(Math.max(parseInteger(this.getAttribute("current-step"), 1) - 1, 0), DEFAULT_STEPS.length - 1); }
  setStepIndex(nextIndex, { emitEvent = false, reason = "step-change" } = {}) {
    const normalized = Math.min(Math.max(nextIndex, 0), DEFAULT_STEPS.length - 1);
    const changed = normalized !== this.stepIndex;
    this.stepIndex = normalized;
    this.syncingAttribute = true;
    this.setAttribute("current-step", String(this.currentStep));
    this.syncingAttribute = false;
    this.render();
    if (changed && emitEvent) this.emitComponentEvent("byda-process-step-change", { reason });
  }
  emitComponentEvent(name, detail = {}) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: { ...detail, currentStep: this.currentStep, stepTitle: buildStageItems(this)[this.stepIndex]?.title || "", value: this.value } })); }
  buildEventPayload() { return { address: { ...this.state.address }, candidates: this.state.candidates.map((candidate) => ({ ...candidate })), existingEnquiries: this.state.existingEnquiries.map((enquiry) => ({ ...enquiry })), selectedSite: this.state.selectedSite ? { ...this.state.selectedSite } : null, selectedExistingEnquiry: this.state.selectedExistingEnquiry ? { ...this.state.selectedExistingEnquiry } : null, enquiry: { ...this.state.enquiry }, tracking: { ...this.state.tracking }, submitted: this.state.submitted }; }
  setDraftTracking() { this.state.submitted = false; this.state.selectedExistingEnquiry = null; this.state.tracking.status = "Draft"; this.state.tracking.displayStatus = "Draft"; this.state.tracking.bydaStatus = "NOT_STARTED"; this.state.tracking.token = ""; this.state.tracking.enquiryId = null; this.state.tracking.readyUrl = ""; this.state.tracking.message = ""; this.state.tracking.completedAt = ""; this.state.tracking.updatedAt = ""; }
  buildEnquiryPayload() {
    this.ensureEnquiryDefaults();
    const authorityId = String(this.state.enquiry.authorityId || "").trim();
    const otherAuthorityName = String(this.state.enquiry.otherAuthorityName || "").trim();
    const selectedSite = this.state.selectedSite && !this.state.selectedSite.addressOnly && this.state.selectedSite.polygon
      ? { ...this.state.selectedSite }
      : undefined;
    return {
      address: { ...this.state.address },
      resolvedSite: selectedSite,
      userReference: String(this.state.enquiry.userReference || "").trim() || undefined,
      digStartAt: this.state.enquiry.digStartAt,
      digEndAt: this.state.enquiry.digEndAt,
      isPlanningJob: true,
      activityTypes: [this.state.enquiry.activityType].filter(Boolean),
      locationTypes: [this.state.enquiry.locationType].filter(Boolean),
      locationsInRoad:
        this.state.enquiry.locationType === "Road Reserve"
          ? [this.state.enquiry.roadLocation].filter(Boolean)
          : [],
      authorityId: authorityId ? Number(authorityId) : undefined,
      otherAuthorityName: otherAuthorityName || undefined,
      notes: String(this.state.enquiry.notes || "").trim() || undefined,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  searchCandidates() {
    if (!this.canGenerateCandidates()) { this.notice = USER_COPY.notices.searchShort; this.noticeTone = "neutral"; this.render(); return; }
    this.syncAddressResults();
    this.notice = "Searching address data."; this.noticeTone = "positive"; this.render(); this.emitComponentEvent("byda-process-change", { reason: "search" });
  }

  async completeFlow() {
    if (!this.isStepTwoComplete()) { this.notice = USER_COPY.notices.datesNeeded; this.noticeTone = "neutral"; this.setStepIndex(1, { emitEvent: true, reason: "incomplete-enquiry" }); return; }
    if (this.submissionLoading) return;
    const enquiryPayload = this.buildEnquiryPayload();
    componentDebugLog(this, "Completing enquiry flow.", {
      payload: enquiryPayload,
      trackingBeforeSubmit: { ...this.state.tracking },
    });
    this.stopStatusPolling();
    this.cancelStatusRequest();
    this.state.selectedExistingEnquiry = null;
    this.ensureEnquiryDefaults();
    this.submissionLoading = true;
    this.notice = USER_COPY.notices.createPending;
    this.noticeTone = "neutral";
    this.render();
    try {
      const result = await fetchJsonForComponent(getEnquiryCreateEndpoint(this), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(enquiryPayload),
      });
      componentDebugLog(this, "Create enquiry response received.", {
        result,
      });
      this.state.submitted = true;
      this.state.tracking.token = result.token || "";
      this.state.tracking.enquiryId = result.enquiryId ?? null;
      this.state.tracking.status = result.status || "processing";
      this.state.tracking.displayStatus = result.displayStatus || result.status || "processing";
      this.state.tracking.bydaStatus = result.bydaStatus || (this.state.tracking.bydaStatus === "NOT_STARTED" ? "CREATING" : this.state.tracking.bydaStatus);
      this.state.tracking.message = result.message || "Enquiry lodged with BYDA. Waiting for status updates.";
      this.state.tracking.completedAt = new Date().toISOString();
      this.state.tracking.updatedAt = this.state.tracking.completedAt;
      this.setStepIndex(2, { emitEvent: true, reason: "complete" });
      const latestStatus = {
        status: result.status || "processing",
        displayStatus: result.displayStatus || result.status || "processing",
        bydaStatus: result.bydaStatus || this.state.tracking.bydaStatus,
        token: result.token || "",
      };
      if (!["ready", "failed"].includes(String(latestStatus.status || "").toLowerCase()) && result.token) {
        this.startStatusPolling({ trackingToken: result.token });
      }
      this.notice = ["ready", "failed"].includes(String(latestStatus.status || "").toLowerCase())
        ? USER_COPY.notices.referenceReady
        : "Enquiry submitted. Status updates will appear here automatically.";
      this.noticeTone = String(latestStatus.status || "").toLowerCase() === "failed" ? "neutral" : "positive";
      this.emitComponentEvent("byda-process-change", { reason: "complete" });
      this.emitComponentEvent("byda-process-complete", { reason: "complete" });
      if (result.token) {
        void this.loadTrackingStatus(result.token)
          .then((status) => {
            componentDebugLog(this, "Immediate post-create status loaded.", {
              status,
              result,
            });
          })
          .catch((error) => {
            componentDebugLog(this, "Immediate post-create status refresh failed.", {
              error: error instanceof Error ? error.message : String(error),
              result,
            });
          });
      }
    } catch (error) {
      componentDebugLog(this, "Completing enquiry flow failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.notice = error instanceof Error ? error.message : "Enquiry could not be created.";
      this.noticeTone = "neutral";
    } finally {
      this.submissionLoading = false;
      componentDebugLog(this, "Completing enquiry flow finished.", {
        tracking: { ...this.state.tracking },
        notice: this.notice,
      });
      this.render();
    }
  }
  async useExistingEnquiry(existingEnquiry) {
    const selectedHistory = normalizeExistingEnquiry(existingEnquiry);
    const matchingCandidate = this.state.candidates.find((candidate) => candidate.title === (selectedHistory.addressLabel || ""));
    this.stopStatusPolling();
    this.cancelStatusRequest();
    this.state.selectedExistingEnquiry = selectedHistory;
    this.state.selectedSite = matchingCandidate?.resolvedSite ? { ...matchingCandidate.resolvedSite } : {
      id: `history-site-${selectedHistory.id || buildIdentifierPart(formatExistingReference(selectedHistory), "SITE")}`,
      label: selectedHistory.addressLabel || formatAddressLabel(this.state.address) || formatExistingReference(selectedHistory),
      title: selectedHistory.addressLabel || formatAddressLabel(this.state.address) || formatExistingReference(selectedHistory),
      source: `${formatExistingSource(selectedHistory.source)} history`,
    };
    this.state.enquiry.userReference = selectedHistory.userReference || "";
    this.state.enquiry.digStartAt = selectedHistory.digStartAt || this.state.enquiry.digStartAt;
    this.state.enquiry.digEndAt = selectedHistory.digEndAt || this.state.enquiry.digEndAt;
    this.state.submitted = true;
    this.state.tracking.status = selectedHistory.status || getExistingEnquiryStatusLabel(selectedHistory);
    this.state.tracking.displayStatus = getExistingEnquiryStatusLabel(selectedHistory);
    this.state.tracking.bydaStatus = selectedHistory.bydaStatus || getExistingEnquiryStatusLabel(selectedHistory);
    this.state.tracking.token = selectedHistory.trackingToken || "";
    this.state.tracking.enquiryId = selectedHistory.enquiryId ?? null;
    this.state.tracking.readyUrl = selectedHistory.readyUrl || "";
    this.state.tracking.message = selectedHistory.message || "";
    this.state.tracking.completedAt = selectedHistory.updatedAt || selectedHistory.createdAt || "";
    this.state.tracking.updatedAt = selectedHistory.updatedAt || selectedHistory.createdAt || "";
    this.notice = "Past enquiry loaded.";
    this.noticeTone = "positive";
    this.setStepIndex(2, { emitEvent: true, reason: "existing-enquiry" });
    try {
      let status = null;
      if (selectedHistory.trackingToken) {
        status = await this.loadTrackingStatus(selectedHistory.trackingToken);
      } else if (selectedHistory.enquiryId) {
        status = await this.loadRemoteEnquiryStatus(selectedHistory.enquiryId);
      } else {
        this.render();
      }
      if (status && !["ready", "failed"].includes(String(status.status || "").toLowerCase())) {
        if (selectedHistory.trackingToken) this.startStatusPolling({ trackingToken: selectedHistory.trackingToken });
        else if (selectedHistory.enquiryId) this.startStatusPolling({ enquiryId: selectedHistory.enquiryId });
      }
    } catch (error) {
      this.notice = error instanceof Error ? error.message : "Past enquiry could not be refreshed.";
      this.noticeTone = "neutral";
      this.render();
    }
    this.emitComponentEvent("byda-process-change", { reason: "select-existing-enquiry" });
  }

  renderAddressStage() {
    const a = this.state.address;
    const selectedSite = this.state.selectedSite;
    const selectedExistingEnquiry = this.state.selectedExistingEnquiry;
    const readonlyAddress = this.isAddressReadonly();
    const enteredAddress = formatAddressLabel(this.state.address);
    const historyResolvedSite = this.state.existingEnquiries.find((enquiry) => enquiry.site?.polygon)?.site || null;
    const searchResults = this.state.candidates.length
      ? this.state.candidates
      : this.state.existingEnquiries.length && enteredAddress
        ? [{ id: "history-only-result", title: enteredAddress, source: "Address history", copy: "Past enquiries found for this address.", resolvedSite: historyResolvedSite, addressOnly: !historyResolvedSite }]
        : [];
    const candidates = this.candidatesLoading ? `
      <div class="empty-state wide">
        <span class="field-label">Matches</span>
        <span class="summary-help">Searching address data.</span>
      </div>
    ` : searchResults.length ? `
      <div class="search-results">
        ${searchResults.map((candidate, candidateIndex) => `
          <div class="search-result ${selectedSite?.id === (candidate.resolvedSite?.id || candidate.id) || (candidate.addressOnly && selectedSite?.addressOnly) ? "active" : ""}">
            <div class="search-result-head">
              <div>
                <span class="field-label">${USER_COPY.search.resultLabel}</span>
                <strong class="search-result-title">${escapeHtml(candidate.title)}</strong>
                <small class="search-result-source">${escapeHtml(candidate.source || candidate.copy || "Address result")}</small>
              </div>
              ${
                candidate.resolvedSite || candidate.addressOnly
                  ? `<button class="button ${selectedSite?.id === (candidate.resolvedSite?.id || candidate.id) || (candidate.addressOnly && selectedSite?.addressOnly) ? "primary" : ""}" type="button" data-action="select-candidate" data-candidate-id="${escapeHtml(candidate.id)}">${selectedSite?.id === (candidate.resolvedSite?.id || candidate.id) || (candidate.addressOnly && selectedSite?.addressOnly) ? USER_COPY.buttons.chosen : USER_COPY.buttons.choose}</button>`
                  : ""
              }
            </div>
            ${candidate.copy ? `<p class="search-result-copy">${escapeHtml(candidate.copy)}</p>` : ""}
            ${
              candidateIndex === 0
                ? `
                  <div class="search-result-history">
                    <span class="field-label">${USER_COPY.existing.title}</span>
                    ${
                      this.existingEnquiriesLoading
                        ? `
                          <div class="search-history-item">
                            <p class="search-result-copy">${escapeHtml(USER_COPY.existing.loading)}</p>
                          </div>
                        `
                        : this.existingEnquiriesError
                          ? `
                            <div class="search-history-item">
                              <p class="search-result-copy">${escapeHtml(this.existingEnquiriesError || USER_COPY.existing.loadError)}</p>
                            </div>
                          `
                          : this.state.existingEnquiries.length
                        ? `
                          <div class="search-history-list">
                            ${this.state.existingEnquiries.map((enquiry) => `
                              <div class="search-history-item ${selectedExistingEnquiry?.id === enquiry.id ? "active" : ""}">
                                <div class="search-result-head">
                                  <strong class="tracking-status-value">${escapeHtml(formatExistingReference(enquiry))}</strong>
                                  <span class="history-status" data-status="${escapeHtml(getExistingEnquiryStatusKey(enquiry))}">
                                    ${escapeHtml(getExistingEnquiryStatusLabel(enquiry))}
                                  </span>
                                </div>
                                <div class="search-history-meta">
                                  <span>${escapeHtml(formatExistingSource(enquiry.source))}</span>
                                  <span>${escapeHtml(formatDateTimeLabel(enquiry.createdAt) || "Not available")}</span>
                                  <span>${escapeHtml(enquiry.bydaStatus || "Not available")}</span>
                                </div>
                                <p class="search-result-copy">${escapeHtml(enquiry.message || "Existing result for the selected address.")}</p>
                                <div class="search-history-actions">
                                  <span class="search-result-copy">${escapeHtml(formatWorkDatesLabel(enquiry.digStartAt, enquiry.digEndAt))}</span>
                                  <button class="button ${selectedExistingEnquiry?.id === enquiry.id ? "primary" : ""}" type="button" data-action="use-existing-enquiry" data-existing-enquiry-id="${escapeHtml(enquiry.id)}">${selectedExistingEnquiry?.id === enquiry.id ? USER_COPY.buttons.chosen : USER_COPY.buttons.use}</button>
                                </div>
                              </div>
                            `).join("")}
                          </div>
                        `
                        : `
                          <div class="search-history-item">
                            <p class="search-result-copy">${escapeHtml(this.canGenerateCandidates() ? USER_COPY.existing.none : USER_COPY.existing.prompt)}</p>
                          </div>
                        `
                    }
                  </div>
                `
                : ""
            }
          </div>
        `).join("")}
      </div>
    ` : `
      <div class="empty-state wide">
        <span class="field-label">Matches</span>
        <span class="summary-help">${escapeHtml(this.candidatesError || (this.canGenerateCandidates() ? USER_COPY.notices.searchNone : USER_COPY.notices.searchEmpty))}</span>
      </div>
    `;
    const addressFields = [
      { label: USER_COPY.search.streetNumber, value: a.streetNumber },
      { label: USER_COPY.search.streetName, value: a.streetName },
      { label: USER_COPY.search.suburb, value: a.suburb },
      { label: USER_COPY.search.state, value: a.state },
      { label: USER_COPY.search.postcode, value: a.postcode },
    ];
    const addressSummary = readonlyAddress
      ? `
        <div class="readonly-address">
          <p class="readonly-address-intro">Address input has been added from the form. Missing values are marked below before matching can continue.</p>
          ${addressFields.map((field) => {
            const value = String(field.value || "").trim();
            const ok = Boolean(value);
            return `
              <div class="readonly-field ${ok ? "" : "missing"}">
                <span class="readonly-icon" aria-hidden="true">${ok ? "✓" : "×"}</span>
                <span>
                  <span class="field-label">${escapeHtml(field.label)}</span>
                  <span class="readonly-value">${escapeHtml(ok ? value : "Missing")}</span>
                </span>
              </div>
            `;
          }).join("")}
        </div>
      `
      : `
        <div class="form-grid">
          <label class="field">
            <span class="field-label">${USER_COPY.search.streetNumber}</span>
            <input class="control" data-scope="address" name="streetNumber" value="${escapeHtml(a.streetNumber)}" placeholder="${USER_COPY.search.streetNumberPlaceholder}" autocomplete="address-line1" inputmode="numeric" />
          </label>
          <label class="field">
            <span class="field-label">${USER_COPY.search.postcode}</span>
            <input class="control" data-scope="address" name="postcode" value="${escapeHtml(a.postcode)}" placeholder="${USER_COPY.search.postcodePlaceholder}" autocomplete="postal-code" inputmode="numeric" />
          </label>
          <label class="field wide">
            <span class="field-label">${USER_COPY.search.streetName}</span>
            <input class="control" data-scope="address" name="streetName" value="${escapeHtml(a.streetName)}" placeholder="${USER_COPY.search.streetNamePlaceholder}" autocomplete="address-line1" />
          </label>
          <label class="field">
            <span class="field-label">${USER_COPY.search.suburb}</span>
            <input class="control" data-scope="address" name="suburb" value="${escapeHtml(a.suburb)}" placeholder="${USER_COPY.search.suburbPlaceholder}" autocomplete="address-level2" />
          </label>
          <label class="field">
            <span class="field-label">${USER_COPY.search.state}</span>
            <select class="control" data-scope="address" name="state">
              <option value="" ${a.state ? "" : "selected"}></option>
              ${STATE_OPTIONS.map((option) => `<option value="${escapeHtml(option)}" ${a.state === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
            </select>
          </label>
        </div>
      `;
    return `
      ${addressSummary}
      <p class="summary-help">${USER_COPY.search.helper}</p>
      ${candidates}
      ${selectedSite ? `<div class="selected-site"><strong>${USER_COPY.search.selectedLabel}:</strong> ${escapeHtml(getSiteDisplayLabel(selectedSite))}</div>` : ""}
    `;
  }

  renderEnquiryStage() {
    const e = this.state.enquiry;
    this.ensureEnquiryDefaults();
    const activityOptions = this.getActivityOptions();
    const locationTypes = this.optionsData?.locationTypes?.length ? this.optionsData.locationTypes : LOCATION_TYPES;
    const roadLocations = this.optionsData?.locationsInRoad?.length ? this.optionsData.locationsInRoad : ROAD_LOCATION_OPTIONS;
    return `
      ${this.state.selectedSite ? `<div class="selected-site"><strong>${USER_COPY.details.locationLabel}:</strong> ${escapeHtml(getSiteDisplayLabel(this.state.selectedSite))}</div>` : ""}
      ${
        this.optionsLoading
          ? `<div class="empty-state wide"><span class="field-label">Options</span><span class="summary-help">${USER_COPY.notices.optionsLoading}</span></div>`
          : this.optionsError
            ? `<div class="empty-state wide"><span class="field-label">Options</span><span class="summary-help">${escapeHtml(this.optionsError)}</span></div>`
            : ""
      }
      ${
        this.authoritiesLoading
          ? `<div class="empty-state wide"><span class="field-label">${USER_COPY.details.authority}</span><span class="summary-help">${USER_COPY.notices.authoritiesLoading}</span></div>`
          : this.authoritiesError
            ? `<div class="empty-state wide"><span class="field-label">${USER_COPY.details.authority}</span><span class="summary-help">${escapeHtml(this.authoritiesError)}</span></div>`
            : ""
      }
      <div class="form-grid">
        <label class="field"><span class="field-label">${USER_COPY.details.startDate}</span><input class="control" type="date" data-scope="enquiry" name="digStartAt" value="${escapeHtml(e.digStartAt)}" /></label>
        <label class="field"><span class="field-label">${USER_COPY.details.endDate}</span><input class="control" type="date" data-scope="enquiry" name="digEndAt" value="${escapeHtml(e.digEndAt)}" /></label>
        <label class="field"><span class="field-label">${USER_COPY.details.activityType}</span><select class="control" data-scope="enquiry" name="activityType" ${boolAttr(this.optionsLoading || !activityOptions.length)}>${activityOptions.map((option) => `<option value="${escapeHtml(option.code)}" ${e.activityType === option.code ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
        <label class="field"><span class="field-label">${USER_COPY.details.locationType}</span><select class="control" data-scope="enquiry" name="locationType">${locationTypes.map((option) => `<option value="${escapeHtml(option)}" ${e.locationType === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>
        ${e.locationType === "Road Reserve" ? `<label class="field"><span class="field-label">${USER_COPY.details.roadLocation}</span><select class="control" data-scope="enquiry" name="roadLocation">${roadLocations.map((option) => `<option value="${escapeHtml(option)}" ${e.roadLocation === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>` : ""}
        <label class="field"><span class="field-label">${USER_COPY.details.authority}</span><select class="control" data-scope="enquiry" name="authorityId"><option value="">Private / not selected</option>${this.authorities.map((authority) => `<option value="${escapeHtml(String(authority.id))}" ${String(e.authorityId || "") === String(authority.id) ? "selected" : ""}>${escapeHtml(getAuthorityLabel(authority))}</option>`).join("")}</select></label>
        <label class="field"><span class="field-label">${USER_COPY.details.manualAuthority}</span><input class="control" data-scope="enquiry" name="otherAuthorityName" value="${escapeHtml(e.otherAuthorityName)}" placeholder="${USER_COPY.details.manualAuthorityPlaceholder}" /></label>
        <label class="field wide"><span class="field-label">${USER_COPY.details.notes}</span><textarea class="textarea" data-scope="enquiry" name="notes" placeholder="${USER_COPY.details.notesPlaceholder}">${escapeHtml(e.notes)}</textarea></label>
      </div>
    `;
  }

  renderTrackingStage() {
    this.ensureEnquiryDefaults();
    const selectedExistingEnquiry = this.state.selectedExistingEnquiry;
    const site = getSiteDisplayLabel(this.state.selectedSite) || formatAddressLabel(this.state.address) || "No site selected";
    if (!this.state.submitted) {
      return `
        <div class="empty-state wide">
          <span class="field-label">${USER_COPY.review.referenceNumber}</span>
          <span class="summary-help">Your reference number is created when you finish the enquiry details step.</span>
        </div>
      `;
    }
    const statusLabel = selectedExistingEnquiry
      ? getExistingEnquiryStatusLabel(selectedExistingEnquiry)
      : (this.state.tracking.displayStatus || this.state.tracking.status || this.state.tracking.bydaStatus || "Submitted");
    const statusKey = selectedExistingEnquiry
      ? getExistingEnquiryStatusKey(selectedExistingEnquiry)
      : String(this.state.tracking.status || this.state.tracking.displayStatus || this.state.tracking.bydaStatus || "submitted").toLowerCase();
    const cardTone = getTrackingTone(statusLabel);
    const cardReference = selectedExistingEnquiry ? formatExistingReference(selectedExistingEnquiry) : (this.state.tracking.token || "Not created yet");
    const cardLocation = selectedExistingEnquiry?.addressLabel || site;
    const cardWorkDates = selectedExistingEnquiry
      ? formatWorkDatesLabel(selectedExistingEnquiry.digStartAt, selectedExistingEnquiry.digEndAt)
      : formatWorkDatesLabel(this.state.enquiry.digStartAt, this.state.enquiry.digEndAt);
    const cardUpdatedAt = selectedExistingEnquiry
      ? (formatDateTimeLabel(selectedExistingEnquiry.updatedAt || selectedExistingEnquiry.createdAt) || "Not available")
      : (formatDateTimeLabel(this.state.tracking.updatedAt || this.state.tracking.completedAt) || "Not available");
    const cardDescription = selectedExistingEnquiry
      ? "You selected a past enquiry from the search results. The BYDA status below reflects that saved enquiry."
      : (this.state.tracking.message || "The enquiry has been submitted. The latest BYDA status is shown below.");
    const statusValue = selectedExistingEnquiry
      ? (selectedExistingEnquiry.bydaStatus || statusLabel)
      : (this.state.tracking.bydaStatus || "Not available");
    const readyUrl = selectedExistingEnquiry ? selectedExistingEnquiry.readyUrl : this.state.tracking.readyUrl;
    const statusCopy = selectedExistingEnquiry
      ? (selectedExistingEnquiry.message || "Loaded from the saved enquiry you selected in the search results.")
      : (this.state.tracking.message || "The latest BYDA status for this enquiry.");
    return `
      <byda-status-card
        eyebrow="${escapeHtml(selectedExistingEnquiry ? "Past enquiry selected" : "Enquiry submitted")}"
        heading="${escapeHtml(selectedExistingEnquiry ? "Selected enquiry status" : "Live enquiry status")}"
        status="${escapeHtml(statusLabel)}"
        tone="${escapeHtml(cardTone)}"
        reference="${escapeHtml(cardReference)}"
        location="${escapeHtml(cardLocation)}"
        work-dates="${escapeHtml(cardWorkDates)}"
        updated-at="${escapeHtml(cardUpdatedAt)}"
        description="${escapeHtml(cardDescription)}"
      >
        <div slot="media" class="status-media">REF</div>
        <div class="tracking-status-list">
          <div class="tracking-status-item">
            <div class="tracking-status-head">
              <span class="field-label">BYDA status</span>
              <span class="history-status" data-status="${escapeHtml(statusKey)}">${escapeHtml(statusLabel)}</span>
            </div>
            <span class="tracking-status-value">${escapeHtml(statusValue)}</span>
            <p class="tracking-status-copy">${escapeHtml(statusCopy)}</p>
          </div>
        </div>
        ${readyUrl ? `<a slot="actions" href="${escapeHtml(readyUrl)}" target="_blank" rel="noreferrer">Open report</a>` : ""}
      </byda-status-card>
    `;
  }

  renderBody() { return this.stepIndex === 0 ? this.renderAddressStage() : this.stepIndex === 1 ? this.renderEnquiryStage() : this.renderTrackingStage(); }

  captureFocusSnapshot() {
    const active = this.shadowRoot.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) return null;
    return {
      scope: active.dataset.scope || "",
      name: active.name || "",
      selectionStart: "selectionStart" in active ? active.selectionStart : null,
      selectionEnd: "selectionEnd" in active ? active.selectionEnd : null,
    };
  }

  restoreFocusSnapshot(snapshot) {
    if (!snapshot || !snapshot.scope || !snapshot.name) return;
    const nextField = this.shadowRoot.querySelector(`[data-scope="${snapshot.scope}"][name="${snapshot.name}"]`);
    if (!(nextField instanceof HTMLInputElement || nextField instanceof HTMLTextAreaElement || nextField instanceof HTMLSelectElement)) return;
    nextField.focus({ preventScroll: true });
    if (
      (nextField instanceof HTMLInputElement || nextField instanceof HTMLTextAreaElement) &&
      typeof snapshot.selectionStart === "number" &&
      typeof snapshot.selectionEnd === "number"
    ) {
      nextField.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }

  updateFieldValue(target) {
    const scope = target.dataset.scope;
    const field = target.name;
    if (!scope || !field || (scope !== "address" && scope !== "enquiry")) return false;
    const nextValue = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    if (this.state[scope][field] === nextValue) return false;
    this.state[scope][field] = nextValue;
    if (scope === "address") {
      this.syncAddressResults();
    }
    if (scope === "enquiry") {
      if (field === "authorityId" && String(nextValue || "").trim()) this.state.enquiry.otherAuthorityName = "";
      if (field === "otherAuthorityName" && String(nextValue || "").trim()) this.state.enquiry.authorityId = "";
      if (field === "locationType") this.ensureEnquiryDefaults();
      this.setDraftTracking();
    }
    return true;
  }

  handleFieldChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (!this.updateFieldValue(target)) return;
    this.notice = ""; this.noticeTone = "neutral";
    if (target.dataset.scope === "address" && this.stepIndex === 0) { this.render(); this.emitComponentEvent("byda-process-change", { reason: "address-input" }); return; }
    this.syncFooterState(); this.syncDebugState(); this.emitComponentEvent("byda-process-change", { reason: "field-change" });
  }

  handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.getAttribute("data-action");
    if (action === "previous") { this.notice = ""; this.noticeTone = "neutral"; this.setStepIndex(this.stepIndex - 1, { emitEvent: true, reason: "previous" }); return; }
    if (action === "next") {
      if (!this.canAdvance()) { this.notice = this.stepIndex === 0 ? "Choose a location to continue." : USER_COPY.notices.datesNeeded; this.noticeTone = "neutral"; this.render(); return; }
      this.notice = ""; this.noticeTone = "neutral";
      if (this.stepIndex === 1) {
        if (this.state.submitted) {
          this.setStepIndex(2, { emitEvent: true, reason: "next" });
        } else {
          void this.completeFlow();
        }
        return;
      }
      this.setStepIndex(this.stepIndex + 1, { emitEvent: true, reason: "next" }); return;
    }
    if (action === "reset") { this.reset(); return; }
    if (action === "complete") { void this.completeFlow(); return; }
    if (action === "select-candidate") {
      const candidateId = actionTarget.getAttribute("data-candidate-id");
      const selectedCandidate = this.state.candidates.find((candidate) => candidate.id === candidateId)
        || (candidateId === "history-only-result" && this.state.existingEnquiries.length ? { id: candidateId, addressOnly: true } : null);
      if (!selectedCandidate?.resolvedSite && !selectedCandidate?.addressOnly) return;
      this.state.selectedSite = selectedCandidate.resolvedSite ? { ...selectedCandidate.resolvedSite } : buildAddressOnlySite(this.state.address); this.setDraftTracking();
      this.state.enquiry.userReference = "";
      this.ensureAutoUserReference();
      this.notice = USER_COPY.notices.locationSelected; this.noticeTone = "positive"; this.render();
      if (!this.state.selectedSite.addressOnly) void this.loadAuthorities(this.state.selectedSite);
      this.emitComponentEvent("byda-process-change", { reason: "select-site" });
      return;
    }
    if (action === "use-existing-enquiry") {
      const enquiryId = actionTarget.getAttribute("data-existing-enquiry-id");
      const selectedExistingEnquiry = this.state.existingEnquiries.find((enquiry) => enquiry.id === enquiryId);
      if (!selectedExistingEnquiry) return;
      void this.useExistingEnquiry(selectedExistingEnquiry);
    }
  }

  syncFooterState() {
    const items = buildStageItems(this);
    this.elements.previous.disabled = this.stepIndex <= 0;
    this.elements.next.disabled = this.stepIndex >= items.length - 1 || !this.canAdvance() || (this.stepIndex === 1 && this.submissionLoading);
    this.elements.next.hidden = this.stepIndex >= items.length - 1;
  }

  syncDebugState() {
    const enabled = this.hasAttribute("debug");
    this.elements.debugShell.hidden = !enabled;
    if (!enabled) return;
    this.elements.debugOutput.textContent = JSON.stringify({ currentStep: this.currentStep, stepTitle: buildStageItems(this)[this.stepIndex]?.title || "", value: this.value }, null, 2);
  }

  render() {
    const items = buildStageItems(this);
    const active = items[this.stepIndex];
    const focusSnapshot = this.captureFocusSnapshot();
    this.elements.heading.textContent = getTrimmedAttribute(this, "heading") || USER_COPY.defaults.heading;
    this.elements.count.textContent = USER_COPY.chrome.count(this.currentStep, items.length);
    this.elements.stageIndex.textContent = String(this.currentStep).padStart(2, "0");
    this.elements.stageTitle.textContent = active.title;
    this.elements.stageDetail.textContent = active.detail;
    this.elements.previous.textContent = getTrimmedAttribute(this, "previous-label") || USER_COPY.buttons.back;
    this.elements.next.textContent = getTrimmedAttribute(this, "next-label")
      || (this.stepIndex === 1 && !this.state.submitted
        ? (this.submissionLoading ? "Creating..." : USER_COPY.buttons.finish)
        : USER_COPY.buttons.continue);
    const resetButton = this.shadowRoot.querySelector(".reset");
    resetButton.textContent = USER_COPY.buttons.restart;
    resetButton.hidden = this.isAddressReadonly();
    this.elements.body.innerHTML = this.renderBody();
    this.elements.notice.hidden = !this.notice;
    this.elements.notice.textContent = this.notice;
    this.elements.notice.classList.toggle("positive", this.noticeTone === "positive");
    this.syncFooterState();
    this.syncDebugState();
    this.restoreFocusSnapshot(focusSnapshot);
  }
}
