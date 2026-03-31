const controls = document.querySelector("#playgroundControls");
const card = document.querySelector("#demoCard");
const bodyCopy = document.querySelector("#demoBodyCopy");
const logLine = document.querySelector("#actionLog");

const fieldMap = {
  eyebrow: "eyebrow",
  heading: "heading",
  status: "status",
  tone: "tone",
  reference: "reference",
  location: "location",
  updatedAt: "updated-at",
  description: "description",
};

function syncComponent() {
  Object.entries(fieldMap).forEach(([fieldName, attributeName]) => {
    const field = controls.elements.namedItem(fieldName);

    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
      return;
    }

    const value = field.value.trim();

    if (!value) {
      card.removeAttribute(attributeName);
      return;
    }

    card.setAttribute(attributeName, value);
  });

  const bodyField = controls.elements.namedItem("body");
  if (bodyField instanceof HTMLTextAreaElement) {
    bodyCopy.textContent = bodyField.value.trim();
  }
}

controls.addEventListener("input", syncComponent);
controls.addEventListener("change", syncComponent);

card.addEventListener("click", (event) => {
  const actionTarget = event.target.closest('[slot="actions"]');
  if (!actionTarget) {
    return;
  }

  const actionLabel = actionTarget.textContent?.trim() || "Action";
  logLine.textContent = `Last interaction: ${actionLabel}`;
});

syncComponent();
