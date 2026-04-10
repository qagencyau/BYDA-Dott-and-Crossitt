const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      --byda-card-font-family:
        "Space Grotesk",
        "Segoe UI",
        sans-serif;
      --byda-card-display-family:
        "Fraunces",
        Georgia,
        serif;
      --byda-card-ink: #18261f;
      --byda-card-muted: #56655d;
      --byda-card-line: rgba(24, 38, 31, 0.12);
      --byda-card-surface: rgba(255, 252, 247, 0.94);
      --byda-card-shadow: 0 24px 64px rgba(42, 34, 24, 0.16);
      --byda-card-accent: #bb5c2d;
      --byda-card-accent-strong: #7d3213;
      --byda-card-accent-soft: rgba(187, 92, 45, 0.14);
      --byda-card-radius: 28px;
      --byda-card-padding: 28px;
      display: block;
      color: var(--byda-card-ink);
      font-family: var(--byda-card-font-family);
    }

    * {
      box-sizing: border-box;
    }

    .card {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--byda-card-line);
      border-radius: var(--byda-card-radius);
      background:
        linear-gradient(155deg, rgba(255, 255, 255, 0.96), rgba(247, 240, 231, 0.88)),
        linear-gradient(120deg, var(--byda-card-accent-soft), transparent 55%);
      box-shadow: var(--byda-card-shadow);
      isolation: isolate;
    }

    .card::before {
      content: "";
      position: absolute;
      inset: -35% auto auto -10%;
      width: 240px;
      height: 240px;
      border-radius: 999px;
      background: radial-gradient(circle, var(--byda-card-accent-soft), transparent 70%);
      opacity: 0.9;
      pointer-events: none;
      z-index: -1;
    }

    .frame {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 22px;
      padding: var(--byda-card-padding);
    }

    .topline {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }

    .eyebrow {
      margin: 0;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--byda-card-accent-strong);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      min-height: 38px;
      padding: 9px 14px;
      border-radius: 999px;
      background: var(--byda-card-accent-soft);
      color: var(--byda-card-accent-strong);
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .headline-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 20px;
      align-items: start;
    }

    .copy {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .heading {
      margin: 0;
      font-family: var(--byda-card-display-family);
      font-size: clamp(1.75rem, 3.6vw, 2.5rem);
      line-height: 0.96;
      text-wrap: balance;
    }

    .description {
      margin: 0;
      color: var(--byda-card-muted);
      line-height: 1.6;
      max-width: 62ch;
    }

    .media-wrap {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-width: 88px;
      min-height: 88px;
      padding: 10px;
      border-radius: 24px;
      border: 1px solid rgba(24, 38, 31, 0.08);
      background: rgba(255, 255, 255, 0.66);
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin: 0;
      padding: 0;
    }

    .meta-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.68);
      border: 1px solid rgba(24, 38, 31, 0.08);
    }

    .meta-label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--byda-card-muted);
    }

    .meta-value {
      min-width: 0;
      font-size: 0.98rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .body-wrap {
      min-width: 0;
      padding: 18px 20px;
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.58);
      border: 1px solid rgba(24, 38, 31, 0.08);
      color: var(--byda-card-muted);
      line-height: 1.65;
    }

    .actions-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    ::slotted(*) {
      max-width: 100%;
    }

    ::slotted(p) {
      margin: 0;
    }

    ::slotted([slot="actions"]) {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 12px 18px;
      border-radius: 999px;
      border: 1px solid rgba(24, 38, 31, 0.1);
      background: rgba(24, 38, 31, 0.06);
      color: var(--byda-card-ink);
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition:
        transform 140ms ease,
        background 140ms ease,
        border-color 140ms ease;
    }

    ::slotted([slot="actions"]:hover) {
      transform: translateY(-1px);
      background: rgba(24, 38, 31, 0.09);
      border-color: rgba(24, 38, 31, 0.16);
    }

    :host([tone="active"]) {
      --byda-card-accent: #bb5c2d;
      --byda-card-accent-strong: #7d3213;
      --byda-card-accent-soft: rgba(187, 92, 45, 0.14);
    }

    :host([tone="success"]) {
      --byda-card-accent: #2d8d62;
      --byda-card-accent-strong: #165138;
      --byda-card-accent-soft: rgba(45, 141, 98, 0.14);
    }

    :host([tone="warning"]) {
      --byda-card-accent: #c48b1f;
      --byda-card-accent-strong: #7a540a;
      --byda-card-accent-soft: rgba(196, 139, 31, 0.16);
    }

    :host([tone="critical"]) {
      --byda-card-accent: #c2524a;
      --byda-card-accent-strong: #7f241d;
      --byda-card-accent-soft: rgba(194, 82, 74, 0.16);
    }

    :host([tone="neutral"]) {
      --byda-card-accent: #3d7a8e;
      --byda-card-accent-strong: #214554;
      --byda-card-accent-soft: rgba(61, 122, 142, 0.14);
    }

    @media (max-width: 720px) {
      :host {
        --byda-card-padding: 22px;
      }

      .topline,
      .headline-grid {
        grid-template-columns: 1fr;
        flex-direction: column;
        align-items: start;
      }

      .media-wrap {
        min-width: 72px;
        min-height: 72px;
      }
    }
  </style>

  <article class="card">
    <div class="frame">
      <div class="topline">
        <p class="eyebrow"></p>
        <span class="status-pill"></span>
      </div>

      <div class="headline-grid">
        <div class="copy">
          <h2 class="heading"></h2>
          <p class="description"></p>
        </div>

        <div class="media-wrap" hidden>
          <slot name="media"></slot>
        </div>
      </div>

      <dl class="meta" hidden></dl>

      <div class="body-wrap" hidden>
        <slot></slot>
      </div>

      <div class="actions-wrap" hidden>
        <slot name="actions"></slot>
      </div>
    </div>
  </article>
`;

function getTrimmedAttribute(element, name) {
  return String(element.getAttribute(name) || "").trim();
}

function setTextContent(element, value) {
  element.textContent = value;
}

function hasAssignedContent(slot) {
  return slot.assignedNodes({ flatten: true }).some((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return Boolean(node.textContent?.trim());
    }

    return true;
  });
}

export class BydaStatusCard extends HTMLElement {
  static tagName = "byda-status-card";

  static observedAttributes = [
    "description",
    "eyebrow",
    "heading",
    "location",
    "reference",
    "status",
    "tone",
    "updated-at",
    "work-dates",
  ];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.elements = {
      eyebrow: this.shadowRoot.querySelector(".eyebrow"),
      heading: this.shadowRoot.querySelector(".heading"),
      description: this.shadowRoot.querySelector(".description"),
      status: this.shadowRoot.querySelector(".status-pill"),
      meta: this.shadowRoot.querySelector(".meta"),
      mediaWrap: this.shadowRoot.querySelector(".media-wrap"),
      bodyWrap: this.shadowRoot.querySelector(".body-wrap"),
      actionsWrap: this.shadowRoot.querySelector(".actions-wrap"),
      mediaSlot: this.shadowRoot.querySelector('slot[name="media"]'),
      bodySlot: this.shadowRoot.querySelector("slot:not([name])"),
      actionsSlot: this.shadowRoot.querySelector('slot[name="actions"]'),
    };

    this.handleSlotChange = this.handleSlotChange.bind(this);
  }

  connectedCallback() {
    this.elements.mediaSlot.addEventListener("slotchange", this.handleSlotChange);
    this.elements.bodySlot.addEventListener("slotchange", this.handleSlotChange);
    this.elements.actionsSlot.addEventListener("slotchange", this.handleSlotChange);
    this.render();
    this.handleSlotChange();
  }

  disconnectedCallback() {
    this.elements.mediaSlot.removeEventListener("slotchange", this.handleSlotChange);
    this.elements.bodySlot.removeEventListener("slotchange", this.handleSlotChange);
    this.elements.actionsSlot.removeEventListener("slotchange", this.handleSlotChange);
  }

  attributeChangedCallback() {
    this.render();
  }

  handleSlotChange() {
    this.elements.mediaWrap.hidden = !hasAssignedContent(this.elements.mediaSlot);
    this.elements.bodyWrap.hidden = !hasAssignedContent(this.elements.bodySlot);
    this.elements.actionsWrap.hidden = !hasAssignedContent(this.elements.actionsSlot);
  }

  render() {
    const eyebrow = getTrimmedAttribute(this, "eyebrow") || "Reusable UI";
    const heading = getTrimmedAttribute(this, "heading") || "BYDA component starter";
    const status = getTrimmedAttribute(this, "status") || "Ready";
    const description =
      getTrimmedAttribute(this, "description") ||
      "Ship this as a single Web Component and reuse it in WordPress, React, Angular, or a plain HTML page.";

    setTextContent(this.elements.eyebrow, eyebrow);
    setTextContent(this.elements.heading, heading);
    setTextContent(this.elements.status, status);
    setTextContent(this.elements.description, description);

    const metaRows = [
      {
        label: "Reference",
        value: getTrimmedAttribute(this, "reference"),
      },
      {
        label: "Location",
        value: getTrimmedAttribute(this, "location"),
      },
      {
        label: "Work dates",
        value: getTrimmedAttribute(this, "work-dates"),
      },
      {
        label: "Updated",
        value: getTrimmedAttribute(this, "updated-at"),
      },
    ].filter((row) => row.value);

    this.elements.meta.hidden = metaRows.length === 0;
    this.elements.meta.innerHTML = metaRows
      .map(
        (row) => `
          <div class="meta-row">
            <dt class="meta-label">${row.label}</dt>
            <dd class="meta-value">${row.value}</dd>
          </div>
        `,
      )
      .join("");
  }
}
