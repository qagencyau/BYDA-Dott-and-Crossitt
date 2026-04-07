const DEFAULT_STEPS = ["Find Location", "Enquiry Details", "Review & Track"];
const DEFAULT_DETAILS = [
  "Enter the address details and choose the best match.",
  "Add your dates and any extra details you want included.",
  "Check your details and keep your reference number for later.",
];
const ACTIVITY_OPTIONS = ["Conceptual Design", "Engineering Design", "Excavation", "Maintenance"];
const LOCATION_OPTIONS = ["Private", "Road Reserve", "Footpath", "Nature Strip"];
const STATE_OPTIONS = ["NSW", "QLD", "VIC"];
const DEFAULT_VALUE = {
  address: {
    streetNumber: "",
    streetName: "",
    suburb: "",
    state: "NSW",
    postcode: "",
  },
  enquiry: {
    digStartAt: "",
    digEndAt: "",
    userReference: "",
    isPlanning: false,
    activityType: ACTIVITY_OPTIONS[0],
    locationType: LOCATION_OPTIONS[0],
    authority: "",
    notes: "",
  },
  candidates: [],
  existingEnquiries: [],
  selectedSite: null,
  tracking: { status: "Draft", bydaStatus: "NOT_STARTED", token: "", completedAt: "" },
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
    choose: "Choose",
    chosen: "Chosen",
    finish: "Create Reference",
  },
  chrome: {
    count: (step, total) => `Step ${step} of ${total}`,
  },
  notices: {
    reset: "You can start again at any time.",
    searchShort: "Enter street number, street name and suburb to search.",
    datesNeeded: "Add your start and end dates to continue.",
    locationSelected: "Location selected.",
    referenceReady: "Reference number created.",
    searchEmpty: "Enter street number, street name and suburb to see matches.",
    searchNone: "Check the address details to see more matches.",
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
    helper: "Matches appear below once enough address details are entered.",
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
    activityType: "Activity type",
    locationType: "Location type",
    planning: "Planning enquiry",
    planningHelp: "Turn this on if this enquiry is only for planning.",
    notes: "Notes",
    notesPlaceholder: "Add extra details if needed.",
  },
  review: {
    title: "Review & track",
    copy: "Check your details and keep your reference number for later.",
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
      detail: "Your details are ready to review.",
      status: "Ready to finish",
    },
    complete: {
      label: "Complete",
      percent: 100,
      detail: "Your reference number is ready to use.",
      status: "Complete",
    },
  },
  candidates: {
    top: {
      badge: "Best match",
      copy: "Closest match for what you typed.",
    },
    nearby: {
      badge: "Another match",
      copy: "Another nearby result you can choose instead.",
    },
    parcel: {
      badge: "Parcel match",
      copy: "A parcel result based on your search.",
    },
  },
  existing: {
    title: "Past enquiries for this address",
    copy: "Use these existing results to check what has already been lodged for the same location.",
    prompt: "Existing results appear once enough address details are entered.",
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
    .notice,.selected-site,.field,.summary-card,.candidate-card,.empty-state,.history-card,.history-meta-item{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:18px;border:1px solid rgba(24,38,31,.08);background:rgba(255,255,255,.8)}
    .notice[hidden],.debug-shell[hidden]{display:none}
    .notice.positive,.selected-site{background:rgba(45,141,98,.1);border-color:rgba(45,141,98,.16);color:var(--successInk)}
    .body,.candidate-list,.button-row,.history-section,.history-list{display:flex;flex-direction:column;gap:18px}
    .form-grid,.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .wide{grid-column:1/-1}
    .control,.textarea{width:100%;min-height:48px;padding:12px 14px;border-radius:14px;border:1px solid rgba(24,38,31,.1);background:#fff;color:var(--ink);font:inherit;font-size:.96rem}
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
    .history-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .history-card{gap:14px}
    .history-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .history-meta-item{padding:12px 14px;background:rgba(255,255,255,.72)}
    .history-status{display:inline-flex;align-items:center;min-height:32px;padding:6px 10px;border-radius:999px;background:rgba(24,38,31,.08);color:var(--ink);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .history-status[data-status="ready"]{background:rgba(45,141,98,.14);color:var(--successInk)}
    .history-status[data-status="processing"]{background:rgba(196,139,31,.16);color:#7a540a}
    .history-status[data-status="historical"]{background:rgba(61,122,142,.14);color:#214554}
    .progress-track{width:100%;height:10px;border-radius:999px;background:rgba(24,38,31,.1);overflow:hidden}
    .progress-fill{height:100%;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accentStrong));transition:width .22s ease}
    .payload{margin:0;padding:16px;border-radius:18px;background:#17211c;color:#f4efe6;font-family:"IBM Plex Mono","SFMono-Regular",Consolas,monospace;font-size:.82rem;line-height:1.65;overflow:auto;white-space:pre-wrap;word-break:break-word}
    code{font-family:"IBM Plex Mono","SFMono-Regular",Consolas,monospace}
    @media (max-width:900px){.form-grid,.summary-grid,.history-meta{grid-template-columns:1fr}}
    @media (max-width:720px){.frame{padding:22px}.topline,.footer-actions{flex-direction:column;align-items:stretch}.stage-head{grid-template-columns:1fr}.button{width:100%}.candidate-card{grid-template-columns:1fr}}
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
function createInitialValue(input = {}) {
  const next = cloneValue(DEFAULT_VALUE);
  if (input.address && typeof input.address === "object") Object.assign(next.address, input.address);
  if (input.enquiry && typeof input.enquiry === "object") Object.assign(next.enquiry, input.enquiry);
  if (input.tracking && typeof input.tracking === "object") Object.assign(next.tracking, input.tracking);
  if (Array.isArray(input.candidates)) next.candidates = input.candidates.map((candidate) => ({ ...candidate }));
  if (Array.isArray(input.existingEnquiries)) next.existingEnquiries = input.existingEnquiries.map((enquiry) => ({ ...enquiry }));
  if (input.selectedSite && typeof input.selectedSite === "object") next.selectedSite = { ...input.selectedSite };
  next.submitted = Boolean(input.submitted);
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
function generateToken(seed = "") {
  return `IET-${buildIdentifierPart(seed)}-${String(Date.now()).slice(-6)}`;
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
    String(address.suburb || "").trim().length >= 2
  );
}
function getAddressSeed(address = {}) {
  return formatAddressLabel(address) || String(address.searchText || "").trim();
}
function getAlternateStreetNumber(streetNumber = "") {
  const parsed = Number.parseInt(String(streetNumber).trim(), 10);
  return Number.isNaN(parsed) ? String(streetNumber || "").trim() : String(parsed + 2);
}
function generateCandidates(address) {
  const query = formatAddressLabel(address);
  if (!hasAddressSearchInput(address)) return [];

  const alternateAddress = formatAddressLabel({
    ...address,
    streetNumber: getAlternateStreetNumber(address.streetNumber),
  });

  return [
    {
      id: "top-result",
      title: query,
      copy: USER_COPY.candidates.top.copy,
      badge: USER_COPY.candidates.top.badge,
    },
    {
      id: "nearby-result",
      title: alternateAddress || query,
      copy: USER_COPY.candidates.nearby.copy,
      badge: USER_COPY.candidates.nearby.badge,
    },
    {
      id: "parcel-result",
      title: `Parcel near ${query}`,
      copy: USER_COPY.candidates.parcel.copy,
      badge: USER_COPY.candidates.parcel.badge,
    },
  ];
}

function generateExistingEnquiries(address) {
  const label = formatAddressLabel(address);
  if (!label || !hasAddressSearchInput(address)) return [];

  const seed = buildIdentifierPart(getAddressSeed(address), "SITE");
  const seedNumber = getSeedNumber(seed);
  const baseTime = Date.UTC(2026, 2, 20 + (seedNumber % 7), 8 + (seedNumber % 6), 15, 0);

  return [
    {
      id: `existing-${seed}-ready`,
      addressLabel: label,
      userReference: `IET-REF-${seed}-01`,
      trackingToken: `IET-${seed}-A1`,
      displayStatus: "Ready",
      status: "ready",
      bydaStatus: "ALL_RECEIVED",
      source: "both",
      createdAt: new Date(baseTime).toISOString(),
      message: "Combined report already generated for this address.",
    },
    {
      id: `existing-${seed}-processing`,
      addressLabel: label,
      userReference: `IET-REF-${seed}-02`,
      trackingToken: `IET-${seed}-B2`,
      displayStatus: "Processing",
      status: "processing",
      bydaStatus: "PENDING_RESPONSES",
      source: "local",
      createdAt: new Date(baseTime + 1000 * 60 * 60 * 14).toISOString(),
      message: "Recent enquiry is still waiting on utility responses.",
    },
    {
      id: `existing-${seed}-historical`,
      addressLabel: label,
      enquiryId: 110000 + seedNumber,
      displayStatus: "Historical",
      status: "historical",
      bydaStatus: "ALL_RECEIVED",
      source: "byda",
      createdAt: new Date(baseTime - 1000 * 60 * 60 * 24 * 6).toISOString(),
      message: "Historical BYDA result found for the same address.",
    },
  ].sort((left, right) => compareIsoDates(right.createdAt, left.createdAt));
}

function getSeedNumber(seed = "") {
  return [...String(seed)].reduce((total, character) => total + character.charCodeAt(0), 0);
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
  static observedAttributes = ["current-step", "debug", "details", "heading", "next-label", "previous-label", "steps"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.stepIndex = 0;
    this.state = createInitialValue();
    this.notice = "";
    this.noticeTone = "neutral";
    this.syncingAttribute = false;
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
    this.render();
  }

  disconnectedCallback() {
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
  set value(nextValue) { this.state = createInitialValue(nextValue); this.notice = ""; this.noticeTone = "neutral"; if (this.isConnected) this.render(); }

  reset() { this.state = createInitialValue(); this.notice = USER_COPY.notices.reset; this.noticeTone = "neutral"; this.setStepIndex(0, { emitEvent: true, reason: "reset" }); this.emitComponentEvent("byda-process-change", { reason: "reset" }); }
  goToStep(nextStep) { this.setStepIndex(parseInteger(nextStep, 1) - 1, { emitEvent: true, reason: "programmatic" }); }
  canGenerateCandidates() { return hasAddressSearchInput(this.state.address); }
  isStepOneComplete() { return Boolean(this.state.selectedSite); }
  isStepTwoComplete() { const e = this.state.enquiry; return Boolean(this.isStepOneComplete() && e.digStartAt && e.digEndAt); }
  isStepThreeComplete() { return Boolean(this.state.submitted); }
  canAdvance() { return this.stepIndex === 0 ? this.isStepOneComplete() : this.stepIndex === 1 ? this.isStepTwoComplete() : false; }
  ensureAutoUserReference() {
    if (this.state.enquiry.userReference) return;
    this.state.enquiry.userReference = generateUserReference(this.state.selectedSite?.id || getAddressSeed(this.state.address));
  }
  getEnquiryProgress() {
    if (this.state.submitted) return USER_COPY.progress.complete;
    if (this.isStepTwoComplete()) return USER_COPY.progress.ready;
    if (this.isStepOneComplete()) return USER_COPY.progress.locationSelected;
    if (this.canGenerateCandidates()) return USER_COPY.progress.searching;
    return USER_COPY.progress.notStarted;
  }
  syncAddressResults() {
    this.state.candidates = this.canGenerateCandidates() ? generateCandidates(this.state.address) : [];
    this.state.existingEnquiries = this.canGenerateCandidates() ? generateExistingEnquiries(this.state.address) : [];
    this.state.selectedSite = null;
    this.state.enquiry.userReference = "";
    this.setDraftTracking();
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
  buildEventPayload() { return { address: { ...this.state.address }, candidates: this.state.candidates.map((candidate) => ({ ...candidate })), existingEnquiries: this.state.existingEnquiries.map((enquiry) => ({ ...enquiry })), selectedSite: this.state.selectedSite ? { ...this.state.selectedSite } : null, enquiry: { ...this.state.enquiry }, tracking: { ...this.state.tracking }, submitted: this.state.submitted }; }
  setDraftTracking() { this.state.submitted = false; this.state.tracking.status = "Draft"; this.state.tracking.bydaStatus = "NOT_STARTED"; this.state.tracking.token = ""; this.state.tracking.completedAt = ""; }

  searchCandidates() {
    if (!this.canGenerateCandidates()) { this.notice = USER_COPY.notices.searchShort; this.noticeTone = "neutral"; this.render(); return; }
    this.syncAddressResults();
    this.notice = `${this.state.candidates.length} matches found. ${this.state.existingEnquiries.length} existing result${this.state.existingEnquiries.length === 1 ? "" : "s"} loaded.`; this.noticeTone = "positive"; this.render(); this.emitComponentEvent("byda-process-change", { reason: "search" });
  }

  completeFlow() {
    if (!this.isStepTwoComplete()) { this.notice = USER_COPY.notices.datesNeeded; this.noticeTone = "neutral"; this.setStepIndex(1, { emitEvent: true, reason: "incomplete-enquiry" }); return; }
    this.ensureAutoUserReference();
    this.state.submitted = true; this.state.tracking.status = USER_COPY.progress.complete.status; this.state.tracking.bydaStatus = USER_COPY.progress.complete.status; this.state.tracking.token = this.state.tracking.token || generateToken(this.state.selectedSite?.id || getAddressSeed(this.state.address) || this.state.enquiry.userReference); this.state.tracking.completedAt = new Date().toISOString();
    this.notice = USER_COPY.notices.referenceReady; this.noticeTone = "positive"; this.render(); this.emitComponentEvent("byda-process-change", { reason: "complete" }); this.emitComponentEvent("byda-process-complete", { reason: "complete" });
  }

  renderAddressStage() {
    const a = this.state.address;
    const selectedSite = this.state.selectedSite;
    const emptyStateCopy = this.canGenerateCandidates() ? USER_COPY.notices.searchNone : USER_COPY.notices.searchEmpty;
    const existingEmptyCopy = this.canGenerateCandidates() ? USER_COPY.existing.none : USER_COPY.existing.prompt;
    const candidates = this.state.candidates.length ? `
      <div class="candidate-list">
        ${this.state.candidates.map((candidate) => `
          <div class="candidate-card ${selectedSite?.id === candidate.id ? "active" : ""}">
            <div>
              <span class="field-label">${USER_COPY.search.resultLabel}</span>
              <div class="candidate-title">${escapeHtml(candidate.title)}</div>
              <div class="summary-help">${escapeHtml(candidate.copy)}</div>
            </div>
            <div class="button-row">
              <span class="candidate-badge">${escapeHtml(candidate.badge || "Candidate")}</span>
              <button class="button ${selectedSite?.id === candidate.id ? "primary" : ""}" type="button" data-action="select-candidate" data-candidate-id="${escapeHtml(candidate.id)}">${selectedSite?.id === candidate.id ? USER_COPY.buttons.chosen : USER_COPY.buttons.choose}</button>
            </div>
          </div>
        `).join("")}
      </div>
    ` : `
      <div class="empty-state wide">
        <span class="field-label">Matches</span>
        <span class="summary-help">${emptyStateCopy}</span>
      </div>
    `;
    const existingEnquiries = `
      <div class="history-section">
        <div>
          <span class="field-label">${USER_COPY.existing.title}</span>
          <div class="summary-help">${USER_COPY.existing.copy}</div>
        </div>
        ${
          this.state.existingEnquiries.length
            ? `
              <div class="history-list">
                ${this.state.existingEnquiries.map((enquiry) => `
                  <div class="history-card">
                    <div class="history-head">
                      <div>
                        <span class="field-label">${USER_COPY.existing.resultLabel}</span>
                        <div class="history-title">${escapeHtml(enquiry.addressLabel || formatAddressLabel(this.state.address))}</div>
                        <div class="summary-help">${escapeHtml(enquiry.message || "Existing result for the selected address.")}</div>
                      </div>
                      <span class="history-status" data-status="${escapeHtml(String(enquiry.status || enquiry.displayStatus || enquiry.bydaStatus || "unknown").toLowerCase())}">
                        ${escapeHtml(enquiry.displayStatus || enquiry.status || enquiry.bydaStatus || "Unknown")}
                      </span>
                    </div>
                    <div class="history-meta">
                      <div class="history-meta-item">
                        <span class="field-label">${USER_COPY.existing.reference}</span>
                        <span class="summary-value">${escapeHtml(formatExistingReference(enquiry))}</span>
                      </div>
                      <div class="history-meta-item">
                        <span class="field-label">${USER_COPY.existing.created}</span>
                        <span class="summary-value">${escapeHtml(formatDateTimeLabel(enquiry.createdAt) || "Not available")}</span>
                      </div>
                      <div class="history-meta-item">
                        <span class="field-label">${USER_COPY.existing.source}</span>
                        <span class="summary-value">${escapeHtml(formatExistingSource(enquiry.source))}</span>
                      </div>
                      <div class="history-meta-item">
                        <span class="field-label">${USER_COPY.existing.bydaStatus}</span>
                        <span class="summary-value">${escapeHtml(enquiry.bydaStatus || "Not available")}</span>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `
            : `
              <div class="empty-state wide">
                <span class="field-label">${USER_COPY.existing.title}</span>
                <span class="summary-help">${existingEmptyCopy}</span>
              </div>
            `
        }
      </div>
    `;
    return `
      <div class="form-grid">
        <label class="field">
          <span class="field-label">${USER_COPY.search.streetNumber}</span>
          <input class="control" data-scope="address" name="streetNumber" value="${escapeHtml(a.streetNumber)}" placeholder="${USER_COPY.search.streetNumberPlaceholder}" autocomplete="address-line1" inputmode="numeric" />
        </label>
        <label class="field">
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
            ${STATE_OPTIONS.map((option) => `<option value="${escapeHtml(option)}" ${a.state === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
        <label class="field wide">
          <span class="field-label">${USER_COPY.search.postcode}</span>
          <input class="control" data-scope="address" name="postcode" value="${escapeHtml(a.postcode)}" placeholder="${USER_COPY.search.postcodePlaceholder}" autocomplete="postal-code" inputmode="numeric" />
          <span class="summary-help">${USER_COPY.search.helper}</span>
        </label>
      </div>
      ${candidates}
      ${existingEnquiries}
      ${selectedSite ? `<div class="selected-site"><strong>${USER_COPY.search.selectedLabel}:</strong> ${escapeHtml(selectedSite.title)}</div>` : ""}
    `;
  }

  renderEnquiryStage() {
    const e = this.state.enquiry;
    this.ensureAutoUserReference();
    return `
      ${this.state.selectedSite ? `<div class="selected-site"><strong>${USER_COPY.details.locationLabel}:</strong> ${escapeHtml(this.state.selectedSite.title)}</div>` : ""}
      <div class="form-grid">
        <label class="field"><span class="field-label">${USER_COPY.details.startDate}</span><input class="control" type="date" data-scope="enquiry" name="digStartAt" value="${escapeHtml(e.digStartAt)}" /></label>
        <label class="field"><span class="field-label">${USER_COPY.details.endDate}</span><input class="control" type="date" data-scope="enquiry" name="digEndAt" value="${escapeHtml(e.digEndAt)}" /></label>
        <div class="field">
          <span class="field-label">${USER_COPY.details.yourReference}</span>
          <span class="summary-value">${escapeHtml(e.userReference)}</span>
          <span class="summary-help">${USER_COPY.details.referenceHelp}</span>
        </div>
        <label class="field"><span class="field-label">${USER_COPY.details.authority}</span><input class="control" data-scope="enquiry" name="authority" value="${escapeHtml(e.authority)}" placeholder="Private / not selected" /></label>
        <label class="field"><span class="field-label">${USER_COPY.details.activityType}</span><select class="control" data-scope="enquiry" name="activityType">${ACTIVITY_OPTIONS.map((option) => `<option value="${escapeHtml(option)}" ${e.activityType === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>
        <label class="field"><span class="field-label">${USER_COPY.details.locationType}</span><select class="control" data-scope="enquiry" name="locationType">${LOCATION_OPTIONS.map((option) => `<option value="${escapeHtml(option)}" ${e.locationType === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>
        <label class="field wide"><span class="field-label">${USER_COPY.details.planning}</span><span class="toggle"><input type="checkbox" data-scope="enquiry" name="isPlanning" ${e.isPlanning ? "checked" : ""} /><span>${USER_COPY.details.planningHelp}</span></span></label>
        <label class="field wide"><span class="field-label">${USER_COPY.details.notes}</span><textarea class="textarea" data-scope="enquiry" name="notes" placeholder="${USER_COPY.details.notesPlaceholder}">${escapeHtml(e.notes)}</textarea></label>
      </div>
    `;
  }

  renderTrackingStage() {
    this.ensureAutoUserReference();
    const site = this.state.selectedSite?.title || formatAddressLabel(this.state.address) || "No site selected";
    const progress = this.getEnquiryProgress();
    const nextStepCopy = this.state.submitted ? USER_COPY.review.nextAfterFinish : USER_COPY.review.nextBeforeFinish;
    const nextStepHelp = this.state.submitted ? "Your reference number is ready to keep." : USER_COPY.review.finishHelp;
    return `
      <div class="summary-grid">
        <div class="summary-card wide">
          <span class="summary-label">${USER_COPY.review.progress}</span>
          <span class="summary-value">${escapeHtml(`${progress.percent}% - ${progress.label}`)}</span>
          <div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${progress.percent}%"></div></div>
          <span class="summary-help">${escapeHtml(progress.detail)}</span>
        </div>
        <div class="summary-card"><span class="summary-label">${USER_COPY.review.location}</span><span class="summary-value">${escapeHtml(site)}</span><span class="summary-help">Chosen in the first step.</span></div>
        <div class="summary-card"><span class="summary-label">${USER_COPY.review.workDates}</span><span class="summary-value">${escapeHtml(`${formatDateLabel(this.state.enquiry.digStartAt)} -> ${formatDateLabel(this.state.enquiry.digEndAt)}`)}</span><span class="summary-help">Added in your enquiry details.</span></div>
        <div class="summary-card"><span class="summary-label">${USER_COPY.review.yourReference}</span><span class="summary-value">${escapeHtml(this.state.enquiry.userReference || "Not supplied")}</span><span class="summary-help">${USER_COPY.details.referenceHelp}</span></div>
        <div class="summary-card"><span class="summary-label">${USER_COPY.review.status}</span><span class="summary-value">${escapeHtml(progress.status)}</span><span class="summary-help">Shows where your enquiry is up to.</span></div>
        <div class="summary-card"><span class="summary-label">${USER_COPY.review.referenceNumber}</span><span class="summary-value">${escapeHtml(this.state.tracking.token || "Not created yet")}</span><span class="summary-help">Keep this number for later.</span></div>
        <div class="summary-card"><span class="summary-label">${USER_COPY.review.created}</span><span class="summary-value">${escapeHtml(this.state.tracking.completedAt ? formatDateTimeLabel(this.state.tracking.completedAt) : "Not created yet")}</span><span class="summary-help">This appears once your reference number is ready.</span></div>
        <div class="summary-card wide"><span class="summary-label">${USER_COPY.review.nextStep}</span><span class="summary-value">${escapeHtml(nextStepCopy)}</span><span class="summary-help">${nextStepHelp}</span></div>
      </div>
      ${
        this.state.submitted
          ? ""
          : `<div class="button-row"><button class="button success" type="button" data-action="complete" ${boolAttr(!this.isStepTwoComplete())}>${USER_COPY.buttons.finish}</button></div>`
      }
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
    if (scope === "enquiry") this.setDraftTracking();
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
      this.notice = ""; this.noticeTone = "neutral"; this.setStepIndex(this.stepIndex + 1, { emitEvent: true, reason: "next" }); return;
    }
    if (action === "reset") { this.reset(); return; }
    if (action === "complete") { this.completeFlow(); return; }
    if (action === "select-candidate") {
      const candidateId = actionTarget.getAttribute("data-candidate-id");
      const selectedCandidate = this.state.candidates.find((candidate) => candidate.id === candidateId);
      if (!selectedCandidate) return;
      this.state.selectedSite = { ...selectedCandidate }; this.setDraftTracking();
      this.state.enquiry.userReference = "";
      this.ensureAutoUserReference();
      this.notice = USER_COPY.notices.locationSelected; this.noticeTone = "positive"; this.render(); this.emitComponentEvent("byda-process-change", { reason: "select-site" });
    }
  }

  syncFooterState() {
    const items = buildStageItems(this);
    this.elements.previous.disabled = this.stepIndex <= 0;
    this.elements.next.disabled = this.stepIndex >= items.length - 1 || !this.canAdvance();
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
    this.elements.next.textContent = getTrimmedAttribute(this, "next-label") || USER_COPY.buttons.continue;
    this.shadowRoot.querySelector(".reset").textContent = USER_COPY.buttons.restart;
    this.elements.body.innerHTML = this.renderBody();
    this.elements.notice.hidden = !this.notice;
    this.elements.notice.textContent = this.notice;
    this.elements.notice.classList.toggle("positive", this.noticeTone === "positive");
    this.syncFooterState();
    this.syncDebugState();
    this.restoreFocusSnapshot(focusSnapshot);
  }
}
