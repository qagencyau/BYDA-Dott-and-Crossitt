# Component Library Starter

This repo now includes a framework-agnostic frontend component setup built around Web Components.

## Why this approach

- WordPress can load a browser bundle with a normal `<script>` tag.
- React can render the custom element directly in JSX.
- Angular can render the same element once `CUSTOM_ELEMENTS_SCHEMA` is enabled.
- Vanilla HTML can use the component without any framework runtime.

The components in this starter are:

- `<byda-status-card>` for compact status display
- `<byda-process-steps>` for a self-contained three-step enquiry flow with internal state and custom events

`<byda-status-card>` is intentionally small, but it already demonstrates:

- attribute-driven API
- shadow-DOM encapsulated styles
- named slots for host-provided media and actions
- build output for both ESM imports and direct browser usage

## Files

- `component-library/src/components/byda-status-card.js`: status-card source
- `component-library/src/components/byda-process-steps.js`: staged-flow source
- `component-library/src/index.js`: exports and auto-registration
- `scripts/build-components.js`: bundles the component for distribution and the local playground
- `public/component-playground.html`: interactive demo page

## Commands

```bash
npm run build:components
npm run watch:components
```

`build:components` writes:

- `dist/components/byda-components.esm.js`
- `dist/components/byda-components.js`
- `public/components/byda-components.js`

## Usage

### Interactive Staged Flow

`<byda-process-steps>` is a real interactive element, not a visual mock. It owns its own form fields, maintains internal state across stages, and emits events a host page can consume.

```html
<script src="/components/byda-components.js" defer></script>

<byda-process-steps
  heading="Interactive enquiry timeline"
  debug
></byda-process-steps>

<script>
  const flow = document.querySelector("byda-process-steps");

  flow.addEventListener("byda-process-change", (event) => {
    console.log("draft changed", event.detail.value);
  });

  flow.addEventListener("byda-process-complete", (event) => {
    console.log("completed payload", event.detail.value);
  });
</script>
```

Public surface:

- `element.value`: returns the current component state object
- `element.value = {...}`: seeds the component with programmatic data
- `element.currentStep`: gets or sets the visible step as `1`, `2`, or `3`
- `element.goToStep(stepNumber)`: moves to a specific stage
- `element.reset()`: clears the draft and returns to Step 1

Custom events:

- `byda-process-change`: fires whenever the staged draft changes
- `byda-process-step-change`: fires when navigation moves between stages
- `byda-process-complete`: fires when the user completes the staged test flow

### Vanilla HTML

```html
<script src="/components/byda-components.js" defer></script>

<byda-status-card
  eyebrow="Live enquiry"
  heading="Pyrmont service review"
  status="Awaiting locates"
  tone="active"
  reference="REF-2041"
  location="48 Pirrama Rd, Pyrmont NSW"
  updated-at="2026-03-30 09:15 AEDT"
  description="Shared starter component rendered without a framework."
>
  <button slot="actions" type="button">Open enquiry</button>
</byda-status-card>
```

### React

```jsx
import "path/to/dist/components/byda-components.esm.js";

export function ExampleCard() {
  return (
    <byda-status-card
      eyebrow="React host"
      heading="Dial before you dig"
      status="Ready"
      tone="success"
      reference="REACT-12"
      location="Sydney Metro"
      updated-at="2026-03-30 09:15 AEDT"
      description="React renders the same custom element tag."
    >
      <button slot="actions" type="button" onClick={() => console.log("open")}>
        Open enquiry
      </button>
    </byda-status-card>
  );
}
```

### Angular

```ts
import "path/to/dist/components/byda-components.esm.js";
```

```ts
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from "@angular/core";

@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}
```

```html
<byda-status-card
  eyebrow="Angular host"
  heading="Worksite review"
  status="In progress"
  tone="warning"
  reference="ANG-88"
  location="Brisbane QLD"
  updated-at="2026-03-30 09:15 AEDT"
  description="Angular can render the same element once custom elements are allowed."
>
  <a slot="actions" href="/jobs/ang-88">Open enquiry</a>
</byda-status-card>
```

### WordPress

Register the built browser bundle in your theme or plugin, then print the tag in PHP or block markup.

```php
wp_enqueue_script(
  'byda-components',
  get_stylesheet_directory_uri() . '/assets/byda-components.js',
  array(),
  null,
  true
);
```

```html
<byda-status-card
  eyebrow="WordPress host"
  heading="Embedded enquiry card"
  status="Ready"
  tone="neutral"
  reference="WP-301"
  location="Melbourne VIC"
  updated-at="2026-03-30 09:15 AEDT"
  description="The same bundle works in WordPress with a script enqueue."
></byda-status-card>
```
