import { BydaProcessSteps } from "./components/byda-process-steps.js";
import { BydaStatusCard } from "./components/byda-status-card.js";

export { BydaProcessSteps, BydaStatusCard };

export function defineCustomElements(registry = globalThis.customElements) {
  if (!registry) {
    return;
  }

  if (!registry.get(BydaProcessSteps.tagName)) {
    registry.define(BydaProcessSteps.tagName, BydaProcessSteps);
  }

  if (!registry.get(BydaStatusCard.tagName)) {
    registry.define(BydaStatusCard.tagName, BydaStatusCard);
  }
}

if (typeof window !== "undefined" && window.customElements) {
  defineCustomElements(window.customElements);
}
