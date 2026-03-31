# Component Library Starter

This repo now includes a framework-agnostic frontend component setup built around Web Components.

## Why this approach

- WordPress can load a browser bundle with a normal `<script>` tag.
- React can render the custom element directly in JSX.
- Angular can render the same element once `CUSTOM_ELEMENTS_SCHEMA` is enabled.
- Vanilla HTML can use the component without any framework runtime.

The starter component is `<byda-status-card>`. It is intentionally small, but it already demonstrates:

- attribute-driven API
- shadow-DOM encapsulated styles
- named slots for host-provided media and actions
- build output for both ESM imports and direct browser usage

## Files

- `component-library/src/components/byda-status-card.js`: component source
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
