import { BydaStatusCard } from "./components/byda-status-card.js";

export { BydaStatusCard };

export function defineCustomElements(registry = globalThis.customElements) {
  if (!registry || registry.get(BydaStatusCard.tagName)) {
    return;
  }

  registry.define(BydaStatusCard.tagName, BydaStatusCard);
}

if (typeof window !== "undefined" && window.customElements) {
  defineCustomElements(window.customElements);
}
