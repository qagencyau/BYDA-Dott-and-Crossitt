(function () {
  const settings = window.bydaIetSettings || {};
  const controllerKey = "__bydaIetController";
  const sourceListenerRegistry = new WeakMap();
  const sourceEvents = ["input", "change", "blur", "keyup", "paste", "cut", "compositionend"];
  const stateTemplate = {
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
  };

  function debugLog(message, meta = {}) {
    if (!window.console || typeof window.console.debug !== "function") return;
    window.console.debug(`[BYDA IET Frontend] ${message}`, meta);
  }

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  function registerDynamicRenderHooks(callback) {
    if (window.gform && typeof window.gform.addAction === "function") {
      window.gform.addAction("gform_post_render", callback);
      window.gform.addAction("gform_page_loaded", callback);
    }

    if (window.jQuery && typeof window.jQuery === "function") {
      window.jQuery(document).on("gform_post_render gform_page_loaded", callback);
    }
  }

  function observeDynamicMounts(callback) {
    if (typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (
            node.matches?.('[data-component-host="byda-iet"]') ||
            node.querySelector?.('[data-component-host="byda-iet"]')
          ) {
            callback();
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    const hosts = document.querySelectorAll('[data-component-host="byda-iet"]');
    debugLog("Boot scan.", {
      hostCount: hosts.length,
      settings: {
        apiBase: settings.apiBase || "",
        gfFormId: settings.gfFormId || 0,
        gfTrackingTokenFieldId: settings.gfTrackingTokenFieldId || "",
        gfReportUrlFieldId: settings.gfReportUrlFieldId || "",
        pollIntervalMs: settings.pollIntervalMs || 0,
      },
    });
    hosts.forEach((host, index) => initializeHost(host, index));
  }

  function initializeHost(host, index) {
    if (!host) return;
    if (host.dataset.bydaIetInitialized === "true") {
      const controller = host[controllerKey];
      if (controller && typeof controller.refresh === "function") {
        debugLog("Refreshing existing host controller.", {
          instance: host.dataset.instance || "",
          index,
        });
        controller.refresh();
      }
      return;
    }

    const component = host.querySelector("byda-process-steps");
    if (!component || typeof component.value === "undefined") {
      debugLog("Host skipped because component is not ready.", {
        instance: host.dataset.instance || "",
        index,
        hasComponent: Boolean(component),
        hasValueApi: Boolean(component && typeof component.value !== "undefined"),
      });
      return;
    }

    host.dataset.bydaIetInitialized = "true";
    const controller = {
      host,
      component,
      sources: resolveSources(host),
      lastSourceSignature: "",
      sourceWatcher: null,
      refresh() {
        this.sources = resolveSources(host);
        bindSourceListeners(this.sources, this.sync);
        this.sync();
      },
      sync: null,
    };
    const sync = debounce(() => {
      controller.sources = resolveSources(host);
      bindSourceListeners(controller.sources, sync);
      syncPrefill(host, component, controller.sources);
      controller.lastSourceSignature = getSourceSignature(controller.sources);
    }, 120);
    controller.sync = sync;
    host[controllerKey] = controller;
    const syncGravityFields = () => syncGravityFormFields(component, controller.sources);

    bindSourceListeners(controller.sources, sync);
    syncPrefill(host, component, controller.sources);
    controller.lastSourceSignature = getSourceSignature(controller.sources);
    startSourceWatcher(controller);
    syncGravityFields();
    component.addEventListener("byda-process-change", syncGravityFields);
    component.addEventListener("byda-process-step-change", syncGravityFields);
    component.addEventListener("byda-process-change", (event) => {
      debugLog("Component change event.", {
        instance: host.dataset.instance || "",
        reason: event.detail?.reason || "",
        currentStep: event.detail?.currentStep || null,
        tracking: event.detail?.value?.tracking || null,
      });
    });
    component.addEventListener("byda-process-complete", (event) => {
      debugLog("Component complete event.", {
        instance: host.dataset.instance || "",
        tracking: event.detail?.value?.tracking || null,
      });
    });
    debugLog("Host initialized.", {
      instance: host.dataset.instance || "",
      index,
      sources: describeSources(controller.sources),
      initialTracking: component.value?.tracking || null,
    });
  }

  function resolveSources(host) {
    const formId = Number(settings.gfFormId || 0);
    const form = host.closest("form") || (formId ? document.getElementById(`gform_${formId}`) : null);
    const hasAddressMapping = Boolean(
      host.dataset.addressSourceSelector ||
      host.dataset.streetNumberSelector ||
      host.dataset.streetNameSelector ||
      host.dataset.suburbSelector ||
      host.dataset.stateSelector ||
      host.dataset.postcodeSelector ||
      settings.gfStreetNumberFieldId ||
      settings.gfStreetNameFieldId ||
      settings.gfSuburbFieldId ||
      settings.gfStateFieldId ||
      settings.gfPostcodeFieldId
    );

    return {
      form,
      hasAddressMapping,
      addressSource: resolveElement(host.dataset.addressSourceSelector, null, form, formId),
      streetNumber: resolveElement(host.dataset.streetNumberSelector, settings.gfStreetNumberFieldId, form, formId),
      streetName: resolveElement(host.dataset.streetNameSelector, settings.gfStreetNameFieldId, form, formId),
      suburb: resolveElement(host.dataset.suburbSelector, settings.gfSuburbFieldId, form, formId),
      state: resolveElement(host.dataset.stateSelector, settings.gfStateFieldId, form, formId),
      postcode: resolveElement(host.dataset.postcodeSelector, settings.gfPostcodeFieldId, form, formId),
      referenceNumber: resolveElement(host.dataset.referenceNumberSelector, settings.gfReferenceFieldId, form, formId),
      trackingToken: resolveElement(null, settings.gfTrackingTokenFieldId, form, formId),
      reportUrl: resolveElement(null, settings.gfReportUrlFieldId, form, formId),
    };
  }

  function describeSources(sources) {
    return {
      hasForm: Boolean(sources.form),
      formId: sources.form?.id || "",
      hasAddressMapping: Boolean(sources.hasAddressMapping),
      addressSource: describeElement(sources.addressSource),
      streetNumber: describeElement(sources.streetNumber),
      streetName: describeElement(sources.streetName),
      suburb: describeElement(sources.suburb),
      state: describeElement(sources.state),
      postcode: describeElement(sources.postcode),
      referenceNumber: describeElement(sources.referenceNumber),
      trackingToken: describeElement(sources.trackingToken),
      reportUrl: describeElement(sources.reportUrl),
    };
  }

  function describeElement(element) {
    if (!element) return null;
    return {
      id: element.id || "",
      name: element.getAttribute("name") || "",
      tagName: element.tagName || "",
      type: element.getAttribute("type") || "",
      hasValue: Boolean(readValue(element)),
    };
  }

  function resolveElement(selector, fieldId, form, formId) {
    if (selector) {
      const explicit = document.querySelector(selector);
      if (explicit) return explicit;
    }

    if (!fieldId) return null;
    return resolveGfInput(form, formId, fieldId);
  }

  function resolveGfInput(form, formId, fieldId) {
    const safeId = String(fieldId || "").replace(/\./g, "_");
    if (!safeId) return null;

    const inputId = formId ? `input_${formId}_${safeId}` : null;
    if (form) {
      const withinForm = form.querySelector(inputId ? `#${inputId}` : `[name="input_${safeId}"]`);
      if (withinForm) return withinForm;
    }

    if (inputId) {
      return document.getElementById(inputId);
    }

    return null;
  }

  function bindSourceListeners(sources, sync) {
    const elements = [
      sources.form,
      sources.addressSource,
      sources.streetNumber,
      sources.streetName,
      sources.suburb,
      sources.state,
      sources.postcode,
      sources.referenceNumber,
    ].filter(Boolean);
    const unique = [...new Set(elements)];

    unique.forEach((element) => {
      let registry = sourceListenerRegistry.get(element);
      if (!registry) {
        registry = new WeakSet();
        sourceListenerRegistry.set(element, registry);
      }

      if (registry.has(sync)) {
        return;
      }

      registry.add(sync);
      sourceEvents.forEach((eventName) => {
        element.addEventListener(eventName, sync);
      });
    });
  }

  function startSourceWatcher(controller) {
    if (controller.sourceWatcher) {
      window.clearInterval(controller.sourceWatcher);
    }

    controller.sourceWatcher = window.setInterval(() => {
      if (!controller.component || !controller.component.isConnected) {
        window.clearInterval(controller.sourceWatcher);
        controller.sourceWatcher = null;
        return;
      }

      controller.sources = resolveSources(controller.host);
      bindSourceListeners(controller.sources, controller.sync);
      const nextSignature = getSourceSignature(controller.sources);
      if (nextSignature === controller.lastSourceSignature) {
        return;
      }

      controller.lastSourceSignature = nextSignature;
      controller.sync();
    }, 500);
  }

  function syncPrefill(host, component, sources) {
    const current = component.value || {};
    const nextAddress = buildAddressFromSources(sources, current.address || {});
    const referenceNumber = resolveReferenceNumber(host, sources);
    const isReferenceMode = Boolean(referenceNumber);
    const currentReference = String(current.tracking?.token || "").trim();
    const normalizedNext = isReferenceMode
      ? JSON.stringify({ mode: "reference", referenceNumber })
      : JSON.stringify({ mode: "address", address: normalizeAddress(nextAddress) });
    const normalizedPrevious = isReferenceMode
      ? JSON.stringify({ mode: current.submitted ? "reference" : "address", referenceNumber: currentReference })
      : JSON.stringify({ mode: current.submitted && currentReference ? "reference" : "address", address: normalizeAddress(current.address || {}) });

    if (normalizedNext === normalizedPrevious) {
      debugLog("Prefill unchanged.", {
        instance: host.dataset.instance || "",
        isReferenceMode,
        referenceNumber,
        currentStep: component.currentStep,
        sourceSignature: getSourceSignature(sources),
      });
      if (isReferenceMode && component.currentStep !== 3) {
        component.currentStep = 3;
      }
      maybeRefreshAddressResults(host, component, isReferenceMode);
      syncGravityFormFields(component, sources);
      return;
    }

    if (isReferenceMode) {
      debugLog("Applying reference-mode prefill.", {
        instance: host.dataset.instance || "",
        referenceNumber,
        previousTracking: current.tracking || null,
      });
      component.setAttribute("prefill-auto-search", "false");
      component.value = {
        ...current,
        address: nextAddress,
        candidates: [],
        existingEnquiries: [],
        selectedSite: null,
        selectedExistingEnquiry: null,
        enquiry: {
          ...(current.enquiry || {}),
          userReference: "",
        },
        tracking: {
          ...stateTemplate.tracking,
          token: referenceNumber,
          status: "processing",
          displayStatus: "Processing",
          message: "Loading enquiry status.",
        },
        submitted: true,
      };
      component.currentStep = 3;
      syncGravityFormFields(component, sources);
      return;
    }

    component.setAttribute("prefill-auto-search", host.dataset.autoSearch === "true" ? "true" : "false");
    debugLog("Applying address-mode prefill.", {
      instance: host.dataset.instance || "",
      address: nextAddress,
      autoSearch: host.dataset.autoSearch === "true",
    });
    component.value = {
      ...current,
      address: nextAddress,
      candidates: [],
      existingEnquiries: [],
      selectedSite: null,
      selectedExistingEnquiry: null,
      enquiry: {
        ...(current.enquiry || {}),
        userReference: "",
      },
      tracking: {
        ...stateTemplate.tracking,
      },
      submitted: false,
    };
    if (component.currentStep === 3) {
      component.currentStep = 1;
    }
    syncGravityFormFields(component, sources);
  }

  function buildAddressFromSources(sources, fallbackAddress) {
    const useFallback = !sources.hasAddressMapping;
    const fallback = useFallback ? fallbackAddress || {} : {};
    const combined = sources.addressSource ? parseCombinedAddress(readValue(sources.addressSource)) : {};
    const streetLine = parseStreetLine(resolveAddressPart(sources.streetName, combined.streetName, fallback.streetName));
    const explicitStreetNumber = resolveAddressPart(sources.streetNumber, combined.streetNumber, "");
    const streetNumber = explicitStreetNumber || streetLine.streetNumber || String(fallback.streetNumber || "").trim();

    return {
      streetNumber,
      streetName: streetNumber === streetLine.streetNumber ? streetLine.streetName : streetLine.original,
      suburb: resolveAddressPart(sources.suburb, combined.suburb, fallback.suburb),
      state: normalizeState(resolveAddressPart(sources.state, combined.state, fallback.state || "NSW")),
      postcode: resolveAddressPart(sources.postcode, combined.postcode, fallback.postcode).replace(/\D/g, "").slice(0, 4),
    };
  }

  function maybeRefreshAddressResults(host, component, isReferenceMode) {
    if (isReferenceMode || !component || typeof component.value === "undefined") {
      return;
    }

    component.setAttribute("prefill-auto-search", host.dataset.autoSearch === "true" ? "true" : "false");
    if (host.dataset.autoSearch !== "true") {
      return;
    }

    if (typeof component.refreshAddressResults === "function") {
      component.refreshAddressResults({ immediate: true });
    } else if (typeof component.scheduleAddressResultsRefresh === "function") {
      component.scheduleAddressResultsRefresh({ immediate: true });
    }
  }

  function getSourceSignature(sources) {
    return JSON.stringify({
      addressSource: readValue(sources.addressSource),
      streetNumber: readValue(sources.streetNumber),
      streetName: readValue(sources.streetName),
      suburb: readValue(sources.suburb),
      state: readValue(sources.state),
      postcode: readValue(sources.postcode),
      referenceNumber: readValue(sources.referenceNumber),
    });
  }

  function parseCombinedAddress(rawValue) {
    const normalized = String(rawValue || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return {};
    }

    const stateMatch = normalized.match(/\b(NSW|QLD|VIC)\b/i);
    const postcodeMatch = normalized.match(/\b(\d{4})\b(?!.*\b\d{4}\b)/);
    let working = normalized;
    let postcode = "";
    let state = "";

    if (postcodeMatch) {
      postcode = postcodeMatch[1];
      working = working.replace(postcodeMatch[0], " ").replace(/\s+/g, " ").trim();
    }

    if (stateMatch) {
      state = stateMatch[1].toUpperCase();
      working = working.replace(stateMatch[0], " ").replace(/\s+/g, " ").trim();
    }

    const segments = working.split(",").map((segment) => segment.trim()).filter(Boolean);
    let streetLine = "";
    let suburb = "";

    if (segments.length >= 2) {
      streetLine = segments[0];
      suburb = segments[segments.length - 1];
    } else {
      const match = working.match(/^(.+?)\s*,?\s*([^,]+)$/);
      if (match) {
        streetLine = match[1];
        suburb = match[2];
      } else {
        streetLine = working;
      }
    }

    const streetMatch = streetLine.match(/^([0-9A-Z/-]+)\s+(.+)$/i);

    return {
      streetNumber: streetMatch ? streetMatch[1].trim() : "",
      streetName: streetMatch ? streetMatch[2].trim() : streetLine.trim(),
      suburb,
      state,
      postcode,
    };
  }

  function readValue(element) {
    return element ? String(element.value || element.textContent || "").trim() : "";
  }

  function resolveReferenceNumber(host, sources) {
    const inlineReference = String(host.dataset.referenceNumber || "").trim();
    if (inlineReference) {
      return inlineReference;
    }

    return readValue(sources.referenceNumber);
  }

  function parseStreetLine(value) {
    const original = String(value || "").replace(/\s+/g, " ").trim();
    const match = original.match(/^([0-9]+[0-9A-Z/-]*)\s+(.+)$/i);

    return {
      original,
      streetNumber: match ? match[1].trim() : "",
      streetName: match ? match[2].trim() : original,
    };
  }

  function syncGravityFormFields(component, sources) {
    debugLog("Syncing Gravity Forms fields from component state.", {
      tracking: component?.value?.tracking || null,
      trackingField: describeElement(sources.trackingToken),
      reportUrlField: describeElement(sources.reportUrl),
    });
    syncTrackingTokenField(component, sources.trackingToken);
    syncReportUrlField(component, sources.reportUrl);
  }

  function syncTrackingTokenField(component, field) {
    if (!field || !component || typeof component.value === "undefined") {
      return;
    }

    const nextValue = String(component.value?.tracking?.token || "").trim();
    const currentValue = String(field.value || "").trim();
    if (nextValue === currentValue) {
      debugLog("Tracking token field already current.", {
        field: describeElement(field),
        value: nextValue,
      });
      return;
    }

    field.value = nextValue;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    debugLog("Tracking token field updated.", {
      field: describeElement(field),
      previousValue: currentValue,
      nextValue,
    });
  }

  function syncReportUrlField(component, field) {
    if (!field || !component || typeof component.value === "undefined") {
      return;
    }

    const tracking = component.value?.tracking || {};
    const token = String(tracking.token || "").trim();
    const enquiryId = String(tracking.enquiryId || "").trim();
    const readyUrl = String(tracking.readyUrl || "").trim();
    const nextValue = readyUrl || buildReportUrl(token) || buildRemoteReportUrl(enquiryId);
    const currentValue = String(field.value || "").trim();
    if (nextValue === currentValue) {
      debugLog("Report URL field already current.", {
        field: describeElement(field),
        hasValue: Boolean(nextValue),
      });
      return;
    }

    field.value = nextValue;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    debugLog("Report URL field updated.", {
      field: describeElement(field),
      previousValue: currentValue,
      nextValue,
      tracking,
    });
  }

  function buildReportUrl(token) {
    if (!token || !settings.apiBase) {
      return "";
    }

    return `${String(settings.apiBase).replace(/\/+$/, "")}/enquiries/${encodeURIComponent(token)}/report`;
  }

  function buildRemoteReportUrl(enquiryId) {
    if (!enquiryId || !settings.apiBase) {
      return "";
    }

    return `${String(settings.apiBase).replace(/\/+$/, "")}/enquiries/byda/${encodeURIComponent(enquiryId)}/report`;
  }

  function normalizeState(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return ["NSW", "QLD", "VIC"].includes(normalized) ? normalized : "NSW";
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (String(value || "").trim()) {
        return String(value).trim();
      }
    }

    return "";
  }

  function resolveAddressPart(element, combinedValue, fallbackValue) {
    if (element) {
      return readValue(element);
    }

    if (typeof combinedValue === "string") {
      return combinedValue.trim();
    }

    return String(fallbackValue || "").trim();
  }

  function normalizeAddress(address) {
    return JSON.stringify({
      streetNumber: String(address.streetNumber || "").trim().toUpperCase(),
      streetName: String(address.streetName || "").trim().toUpperCase(),
      suburb: String(address.suburb || "").trim().toUpperCase(),
      state: normalizeState(address.state),
      postcode: String(address.postcode || "").replace(/\D/g, "").slice(0, 4),
    });
  }

  function debounce(work, waitMs) {
    let timer = null;

    return function debounced() {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = null;
        work();
      }, waitMs);
    };
  }

  onReady(boot);
  registerDynamicRenderHooks(boot);
  observeDynamicMounts(boot);
})();
