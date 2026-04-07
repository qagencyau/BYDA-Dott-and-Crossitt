const state = {
  options: null,
  health: null,
  history: [],
  selectedSite: null,
  trackingToken: null,
  pollHandle: null,
};

const TEST_CASE = {
  address: {
    streetNumber: "48",
    streetName: "Pirrama Rd",
    suburb: "Pyrmont",
    state: "NSW",
    postcode: "2009",
  },
  enquiry: {
    isPlanningJob: true,
    locationTypes: ["Private"],
    locationsInRoad: [],
    notes: "UAT connectivity and report-generation test from the BYDA enquiry console.",
  },
};

const elements = {
  addressForm: document.querySelector("#addressForm"),
  enquiryForm: document.querySelector("#enquiryForm"),
  candidateList: document.querySelector("#candidateList"),
  addressFeedback: document.querySelector("#addressFeedback"),
  submitFeedback: document.querySelector("#submitFeedback"),
  activityOptions: document.querySelector("#activityOptions"),
  activityCaption: document.querySelector("#activityCaption"),
  selectedSiteCard: document.querySelector("#selectedSiteCard"),
  statusCard: document.querySelector("#statusCard"),
  statusDetails: document.querySelector("#statusDetails"),
  planningToggle: document.querySelector("#planningToggle"),
  authoritySelect: document.querySelector("#authoritySelect"),
  manualAuthority: document.querySelector("#manualAuthority"),
  modeBadge: document.querySelector("#modeBadge"),
  optionsSource: document.querySelector("#optionsSource"),
  trackingTokenInput: document.querySelector("#trackingTokenInput"),
  refreshHistoryButton: document.querySelector("#refreshHistoryButton"),
  historyList: document.querySelector("#historyList"),
  searchAddressButton: document.querySelector("#searchAddressButton"),
  loadTestCaseButton: document.querySelector("#loadTestCaseButton"),
  dryRunEnquiryButton: document.querySelector("#dryRunEnquiryButton"),
  runDiagnosticsButton: document.querySelector("#runDiagnosticsButton"),
  diagnosticsFeedback: document.querySelector("#diagnosticsFeedback"),
  diagnosticsCard: document.querySelector("#diagnosticsCard"),
  diagnosticsChecks: document.querySelector("#diagnosticsChecks"),
};

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.status = response.status;
    error.details = payload.details;
    error.requestId = payload.requestId;
    throw error;
  }

  return payload;
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return "Request failed.";
  }

  const detailText =
    typeof error.details === "string"
      ? error.details
      : error.details
        ? JSON.stringify(error.details)
        : "";
  const requestIdText = error.requestId ? ` Request ID: ${error.requestId}.` : "";

  return `${error.message}${detailText ? ` ${detailText}` : ""}${requestIdText}`.trim();
}

function setFeedback(message, isError = false) {
  elements.submitFeedback.textContent = message || "";
  elements.submitFeedback.style.color = isError ? "#8b1f1f" : "var(--muted)";
}

function setAddressFeedback(message, isError = false) {
  if (!message) {
    elements.addressFeedback.hidden = true;
    elements.addressFeedback.textContent = "";
    return;
  }

  elements.addressFeedback.hidden = false;
  elements.addressFeedback.textContent = message;
  elements.addressFeedback.style.background = isError
    ? "rgba(139, 31, 31, 0.12)"
    : "rgba(47, 109, 79, 0.1)";
  elements.addressFeedback.style.color = isError ? "#8b1f1f" : "#2f6d4f";
}

function setFieldValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field instanceof RadioNodeList) {
    return;
  }

  if (field) {
    field.value = value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setCheckedValues(name, values) {
  const selected = new Set(values);
  [...document.querySelectorAll(`input[name="${name}"]`)].forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function serializeAddressForm() {
  const formData = new FormData(elements.addressForm);
  return {
    streetNumber: String(formData.get("streetNumber") || "").trim(),
    streetName: String(formData.get("streetName") || "").trim(),
    suburb: String(formData.get("suburb") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    postcode: String(formData.get("postcode") || "").trim(),
  };
}

function setStatusCard(title, copy) {
  elements.statusCard.innerHTML = `
    <p class="status-label">Current state</p>
    <strong>${title}</strong>
    <p class="status-copy">${copy}</p>
  `;
}

function renderDetails(rows) {
  elements.statusDetails.innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join("");
}

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatHistorySource(source) {
  switch (source) {
    case "both":
      return "Local + BYDA";
    case "byda":
      return "BYDA";
    default:
      return "Local";
  }
}

function setDiagnosticsCard(title, copy, muted = false) {
  elements.diagnosticsCard.classList.toggle("muted", muted);
  elements.diagnosticsCard.innerHTML = `
    <p class="status-label">Diagnostic state</p>
    <strong>${title}</strong>
    <p class="status-copy">${copy}</p>
  `;
}

function renderSelectedSiteCard(site) {
  if (!site) {
    elements.selectedSiteCard.innerHTML = `
      <p class="status-label">Selected site</p>
      <strong>No address selected yet.</strong>
    `;
    return;
  }

  elements.selectedSiteCard.innerHTML = `
    <p class="status-label">Selected site</p>
    <strong>${site.label}</strong>
    <p class="status-copy">${site.source}</p>
  `;
}

function setSelectedSite(site) {
  state.selectedSite = site;
  renderSelectedSiteCard(site);
}

function setSelectedSitePreview(label, source) {
  state.selectedSite = null;

  if (!label) {
    renderSelectedSiteCard(null);
    return;
  }

  renderSelectedSiteCard({
    label,
    source,
  });
}

function renderCandidates(sites) {
  if (!sites.length) {
    elements.candidateList.innerHTML = "";
    setAddressFeedback("No matching addresses were found for that search.", true);
    setSelectedSite(null);
    return;
  }

  setAddressFeedback(`Found ${sites.length} candidate address${sites.length > 1 ? "es" : ""}.`);
  elements.candidateList.innerHTML = sites
    .map(
      (site, index) => `
        <div class="candidate">
          <div>
            <strong>${site.label}</strong>
            <small>${site.source}</small>
          </div>
          <button class="button button-secondary" type="button" data-site-index="${index}">
            Use This Site
          </button>
        </div>
      `,
    )
    .join("");

  [...elements.candidateList.querySelectorAll("[data-site-index]")].forEach((button) => {
    button.addEventListener("click", async () => {
      const site = sites[Number(button.dataset.siteIndex)];
      setSelectedSite(site);
      await loadAuthorities(site);
    });
  });
}

function renderActivities() {
  if (!state.options) {
    return;
  }

  const isPlanning = elements.planningToggle.checked;
  const activities = isPlanning
    ? state.options.planningActivityTypes
    : state.options.excavationActivityTypes;

  elements.activityCaption.textContent = isPlanning ? "Planning domain" : "Excavation domain";
  elements.activityOptions.innerHTML = activities
    .map(
      (activity, index) => `
        <label class="pill-option">
          <input
            type="checkbox"
            name="activityTypes"
            value="${activity.code}"
            ${index === 0 ? "checked" : ""}
          />
          <span>${activity.label}</span>
        </label>
      `,
    )
    .join("");
}

function renderMetaSummary() {
  if (!state.options) {
    return;
  }

  const baseMessage =
    state.options.optionsSource === "live"
      ? "Activity domains loaded from BYDA."
      : "Using fallback activity domains. Configure live BYDA access before production use.";

  if (!state.health) {
    elements.optionsSource.textContent = baseMessage;
    return;
  }

  elements.optionsSource.textContent = `${baseMessage} ${state.health.enquiryCount} tracked enquiries in the local store.`;
}

function renderHistory() {
  if (!state.history.length) {
    elements.historyList.innerHTML = `
      <div class="history-empty">
        No recent enquiries were found in the local store or BYDA history.
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = state.history
    .map((enquiry) => {
      const heading =
        enquiry.userReference ||
        enquiry.addressLabel ||
        enquiry.trackingToken ||
        (enquiry.enquiryId ? `BYDA enquiry ${enquiry.enquiryId}` : "Saved enquiry");
      const readyLabel = enquiry.fileUrl ? "Open Report" : "Open Link";
      const statusLabel =
        enquiry.displayStatus || enquiry.trackingStatus || enquiry.bydaStatus || "unknown";
      const subtitle =
        enquiry.addressLabel ||
        (enquiry.enquiryId ? `BYDA enquiry ${enquiry.enquiryId}` : enquiry.trackingToken);

      return `
        <article class="history-item">
          <div class="history-item-head">
            <div>
              <strong>${escapeHtml(heading)}</strong>
              <small>${escapeHtml(subtitle)}</small>
            </div>
            <span class="history-status" data-status="${escapeHtml(String(statusLabel).toLowerCase())}">
              ${escapeHtml(statusLabel)}
            </span>
          </div>

          <div class="history-meta">
            <span>${escapeHtml(formatHistorySource(enquiry.source))}</span>
            <span>Created ${escapeHtml(formatDateTime(enquiry.createdAt))}</span>
            <span>BYDA ${escapeHtml(enquiry.bydaStatus || "Pending")}</span>
            <span>${escapeHtml(enquiry.trackingToken ? "Tracked locally" : "Remote only")}</span>
          </div>

          <div class="history-actions">
            <button
              class="button button-secondary"
              type="button"
              data-history-token="${escapeHtml(enquiry.trackingToken || "")}"
              data-history-enquiry-id="${escapeHtml(enquiry.enquiryId || "")}"
            >
              Load Status
            </button>
            ${
              enquiry.readyUrl
                ? `
                  <a
                    class="button button-secondary"
                    href="${escapeHtml(enquiry.readyUrl)}"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ${readyLabel}
                  </a>
                `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  [...elements.historyList.querySelectorAll("[data-history-token]")].forEach((button) => {
    button.addEventListener("click", () => {
      void loadHistoryItem({
        trackingToken: button.dataset.historyToken || "",
        enquiryId: button.dataset.historyEnquiryId || "",
      });
    });
  });
}

function renderDiagnostics(diagnostics) {
  if (!diagnostics) {
    elements.diagnosticsChecks.innerHTML = "";
    setDiagnosticsCard(
      "Not run yet.",
      "Use this before switching from mock mode to live BYDA testing.",
      true,
    );
    return;
  }

  setDiagnosticsCard(
    diagnostics.ok ? "Diagnostic passed" : "Diagnostic found issues",
    `${diagnostics.environment} environment at ${diagnostics.baseUrl}`,
    false,
  );

  elements.diagnosticsChecks.innerHTML = (diagnostics.checks || [])
    .map(
      (check) => `
        <div class="diagnostic-check">
          <span class="diagnostic-badge ${check.ok ? "ok" : "fail"}">
            ${check.ok ? "OK" : "FAIL"}
          </span>
          <div>
            <strong>${check.name}</strong>
            <div>${check.message}</div>
          </div>
        </div>
      `,
    )
    .join("");
}

async function loadOptions() {
  state.options = await fetchJson("/api/options");
  const environmentLabel = state.options.byda?.environment
    ? state.options.byda.environment.toUpperCase()
    : "PRODUCTION";
  elements.modeBadge.textContent =
    state.options.mode === "mock"
      ? `Mock Mode · ${environmentLabel}`
      : `Live Mode · ${environmentLabel}`;
  renderMetaSummary();
  renderActivities();
}

async function loadHealth() {
  state.health = await fetchJson("/api/health");
  renderMetaSummary();
}

async function loadHistory() {
  elements.refreshHistoryButton.disabled = true;

  try {
    const payload = await fetchJson("/api/enquiries?limit=12&source=all");
    state.history = payload.enquiries || [];
    renderHistory();
  } catch (error) {
    state.history = [];
    elements.historyList.innerHTML = `
      <div class="history-empty">${escapeHtml(describeError(error))}</div>
    `;
  } finally {
    elements.refreshHistoryButton.disabled = false;
  }
}

async function searchAddresses({ autoSelectFirst = false } = {}) {
  const query = serializeAddressForm();
  const params = new URLSearchParams(query);

  setAddressFeedback("Searching address data...");
  elements.candidateList.innerHTML = "";
  setSelectedSite(null);

  try {
    const payload = await fetchJson(`/api/addresses/search?${params.toString()}`);
    const sites = payload.sites || [];
    renderCandidates(sites);

    if (autoSelectFirst && sites[0]) {
      setSelectedSite(sites[0]);
      await loadAuthorities(sites[0]);
      setAddressFeedback("Loaded the UAT test case and selected the first matching site.");
    }
  } catch (error) {
    renderCandidates([]);
    setAddressFeedback(error.message, true);
  }
}

async function loadAuthorities(site) {
  elements.authoritySelect.innerHTML = `<option value="">Loading authorities...</option>`;

  try {
    const payload = await fetchJson("/api/organisations/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resolvedSite: site }),
    });

    const organisations = payload.organisations || [];
    elements.authoritySelect.innerHTML = `
      <option value="">Private / not selected</option>
      ${organisations
        .map(
          (organisation) =>
            `<option value="${organisation.id}">${organisation.name}${
              organisation.organisationType ? ` (${organisation.organisationType})` : ""
            }</option>`,
        )
        .join("")}
    `;
  } catch (_error) {
    elements.authoritySelect.innerHTML = `<option value="">Private / not selected</option>`;
  }
}

async function runDiagnostics() {
  elements.runDiagnosticsButton.disabled = true;
  elements.diagnosticsFeedback.textContent = "Running BYDA diagnostic...";

  try {
    const diagnostics = await fetchJson("/api/diagnostics/live", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resolvedSite: state.selectedSite || undefined,
      }),
    });

    renderDiagnostics(diagnostics);
    elements.diagnosticsFeedback.textContent = diagnostics.ok
      ? "Diagnostic completed successfully."
      : "Diagnostic completed with issues. Review the failed checks before live testing.";
  } catch (error) {
    renderDiagnostics(null);
    setDiagnosticsCard("Diagnostic failed", describeError(error), false);
    elements.diagnosticsFeedback.textContent = describeError(error);
  } finally {
    elements.runDiagnosticsButton.disabled = false;
  }
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function buildEnquiryPayload() {
  const formData = new FormData(elements.enquiryForm);
  const authorityId = String(formData.get("authorityId") || "").trim();
  const otherAuthorityName = String(formData.get("otherAuthorityName") || "").trim();

  return {
    address: serializeAddressForm(),
    resolvedSite: state.selectedSite,
    userReference: String(formData.get("userReference") || "").trim() || undefined,
    digStartAt: String(formData.get("digStartAt") || ""),
    digEndAt: String(formData.get("digEndAt") || ""),
    isPlanningJob: elements.planningToggle.checked,
    activityTypes: getCheckedValues("activityTypes"),
    locationTypes: getCheckedValues("locationTypes"),
    locationsInRoad: getCheckedValues("locationsInRoad"),
    authorityId: authorityId ? Number(authorityId) : undefined,
    otherAuthorityName: otherAuthorityName || undefined,
    notes: String(formData.get("notes") || "").trim() || undefined,
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function submitEnquiry(event) {
  event.preventDefault();

  if (!state.selectedSite) {
    setFeedback("Select a resolved address before lodging the enquiry.", true);
    return;
  }

  setFeedback("Submitting enquiry...");

  try {
    const payload = buildEnquiryPayload();
    const result = await fetchJson("/api/enquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    state.trackingToken = result.token;
    elements.trackingTokenInput.value = result.token;
    setFeedback(`Tracking token created: ${result.token}`);
    const status = await loadTrackingStatus(result.token);
    await loadHistory();

    if (status.status !== "ready" && status.status !== "failed") {
      startPolling({ trackingToken: result.token });
    }
  } catch (error) {
    setFeedback(describeError(error), true);
  }
}

function renderStatusDetails(status) {
  const rows = [
    ["History source", formatHistorySource(status.source || "local")],
    ["Tracking token", status.token || "Not tracked locally"],
    ["Mode", status.mode],
    ["Address", status.addressLabel || status.site?.label || "Not available"],
    ["User reference", status.userReference || "Not provided"],
    ["BYDA enquiry", status.enquiryId || "Pending"],
    ["BYDA status", status.bydaStatus || "Pending"],
    [
      "Ready link",
      status.readyUrl
        ? `<a href="${status.readyUrl}" target="_blank" rel="noreferrer">Open report</a>`
        : "Not available yet",
    ],
    ["Last update", status.updatedAt],
  ];

  renderDetails(rows);
}

function renderLoadedStatus(status) {
  const title = String(status.displayStatus || status.status || status.bydaStatus || "unknown");

  setStatusCard(title.toUpperCase(), status.message);
  renderStatusDetails(status);

  if (status.site) {
    setSelectedSite(status.site);
  } else {
    setSelectedSitePreview(
      status.addressLabel || null,
      status.source === "byda" ? "BYDA history" : "Tracked enquiry",
    );
  }

  if (status.status === "ready" || status.status === "failed") {
    stopPolling();
  }
}

function renderDryRunDetails(validation) {
  const rows = [
    ["Mode", "Dry run"],
    ["Selected site", validation.resolvedSite?.label || "Not provided"],
    ["BYDA status", validation.result?.status || "Accepted"],
    ["BYDA enquiry", validation.result?.id || "Not created"],
    ["External ID", validation.result?.externalId || "Not provided"],
    ["Request ID", validation.requestId || "Not provided"],
  ];

  renderDetails(rows);
}

async function loadTrackedEnquiry(token) {
  if (!token) {
    return;
  }

  elements.trackingTokenInput.value = token;
  const status = await loadTrackingStatus(token);

  if (status.status !== "ready" && status.status !== "failed") {
    startPolling({ trackingToken: token });
  }
}

async function loadRemoteEnquiryStatus(enquiryId) {
  if (!enquiryId) {
    return;
  }

  state.trackingToken = null;
  elements.trackingTokenInput.value = "";

  const status = await fetchJson(`/api/enquiries/byda/${enquiryId}`);
  renderLoadedStatus(status);
  return status;
}

async function loadHistoryItem({ trackingToken, enquiryId }) {
  if (trackingToken) {
    await loadTrackedEnquiry(trackingToken);
    return;
  }

  if (!enquiryId) {
    return;
  }

  const status = await loadRemoteEnquiryStatus(enquiryId);

  if (status.status !== "ready" && status.status !== "failed") {
    startPolling({ enquiryId });
  }
}

async function dryRunEnquiry() {
  if (!state.selectedSite) {
    setFeedback("Select a resolved address before running a dry run.", true);
    return;
  }

  elements.dryRunEnquiryButton.disabled = true;
  setFeedback("Running BYDA dry run...");

  try {
    const payload = buildEnquiryPayload();
    const validation = await fetchJson("/api/enquiries/dry-run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setStatusCard(
      "DRY RUN OK",
      "BYDA accepted the enquiry payload. No live enquiry was created.",
    );
    renderDryRunDetails(validation);
    setFeedback(validation.message || "BYDA accepted the dry-run payload.");
  } catch (error) {
    setStatusCard("DRY RUN FAILED", describeError(error));
    setFeedback(describeError(error), true);
  } finally {
    elements.dryRunEnquiryButton.disabled = false;
  }
}

async function loadTrackingStatus(token) {
  const status = await fetchJson(`/api/enquiries/${token}`);
  state.trackingToken = token;
  renderLoadedStatus(status);
  return status;
}

function startPolling(target) {
  stopPolling();
  state.pollHandle = window.setInterval(() => {
    const request = target.trackingToken
      ? loadTrackingStatus(target.trackingToken)
      : loadRemoteEnquiryStatus(target.enquiryId);

    request.catch((error) => {
      setStatusCard("Error", describeError(error));
      stopPolling();
    });
  }, 5000);
}

function stopPolling() {
  if (!state.pollHandle) {
    return;
  }

  window.clearInterval(state.pollHandle);
  state.pollHandle = null;
}

function setDefaultDates() {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const iso = (value) => value.toISOString().slice(0, 10);

  elements.enquiryForm.querySelector('input[name="digStartAt"]').value = iso(today);
  elements.enquiryForm.querySelector('input[name="digEndAt"]').value = iso(tomorrow);
}

function setTestDates() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const iso = (value) => value.toISOString().slice(0, 10);

  setFieldValue(elements.enquiryForm, "digStartAt", iso(tomorrow));
  setFieldValue(elements.enquiryForm, "digEndAt", iso(dayAfter));
}

async function loadTestCase() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);

  setFieldValue(elements.addressForm, "streetNumber", TEST_CASE.address.streetNumber);
  setFieldValue(elements.addressForm, "streetName", TEST_CASE.address.streetName);
  setFieldValue(elements.addressForm, "suburb", TEST_CASE.address.suburb);
  setFieldValue(elements.addressForm, "state", TEST_CASE.address.state);
  setFieldValue(elements.addressForm, "postcode", TEST_CASE.address.postcode);

  elements.planningToggle.checked = TEST_CASE.enquiry.isPlanningJob;
  renderActivities();
  setFieldValue(elements.enquiryForm, "userReference", `UAT-${timestamp}`);
  setFieldValue(elements.enquiryForm, "notes", TEST_CASE.enquiry.notes);
  setCheckedValues("locationTypes", TEST_CASE.enquiry.locationTypes);
  setCheckedValues("locationsInRoad", TEST_CASE.enquiry.locationsInRoad);
  elements.authoritySelect.value = "";
  elements.manualAuthority.value = "";
  setTestDates();
  setFeedback("UAT test case loaded. Review the values and lodge when ready.");

  await searchAddresses({ autoSelectFirst: true });
}

elements.searchAddressButton.addEventListener("click", () => {
  void searchAddresses();
});
elements.loadTestCaseButton.addEventListener("click", () => {
  void loadTestCase();
});
elements.refreshHistoryButton.addEventListener("click", () => {
  void loadHistory();
});
elements.dryRunEnquiryButton.addEventListener("click", () => {
  void dryRunEnquiry();
});
elements.runDiagnosticsButton.addEventListener("click", runDiagnostics);
document.querySelector("#loadTrackingButton").addEventListener("click", async () => {
  const token = elements.trackingTokenInput.value.trim();
  if (!token) {
    return;
  }

  try {
    await loadTrackedEnquiry(token);
  } catch (error) {
    setStatusCard("Not found", describeError(error));
  }
});
elements.planningToggle.addEventListener("change", renderActivities);
elements.enquiryForm.addEventListener("submit", submitEnquiry);
elements.authoritySelect.addEventListener("change", () => {
  if (elements.authoritySelect.value) {
    elements.manualAuthority.value = "";
  }
});
elements.manualAuthority.addEventListener("input", () => {
  if (elements.manualAuthority.value.trim()) {
    elements.authoritySelect.value = "";
  }
});

setDefaultDates();
renderDiagnostics(null);
renderHistory();
Promise.all([loadOptions(), loadHealth(), loadHistory()]).catch((error) => {
  setStatusCard("Startup error", describeError(error));
});
