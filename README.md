# BYDA Dott and Crossitt

First-pass JavaScript implementation of the BYDA enquiry workflow described in the outline PDF.

## What is included

- Express + JavaScript backend
- State-based address search adapters for NSW, QLD, and VIC
- BYDA API client for authentication, enquiry creation, domains, organisations, share links, and combined file polling
- JSON-backed enquiry tracking store
- Structured request logging, atomic-ish store writes, detailed health output, and poll retry tracking
- Minimal browser UI for address search, enquiry submission, and status polling
- Live BYDA diagnostics for auth, domains, and organisation lookup before real lodgements
- Mock mode so the app is runnable before API credentials are configured

## Local setup

1. Copy `.env.example` to `.env`
2. Set `BYDA_USE_MOCK=true` for local testing, or provide real `BYDA_CLIENT_ID` and `BYDA_CLIENT_SECRET`
3. Install dependencies with `npm install`
4. Run `npm run dev`

## Live testing

1. Start with `BYDA_USE_MOCK=false`
2. Set `BYDA_ENVIRONMENT=uat` and provide UAT API keys first
3. Leave `BYDA_BASE_URL` blank unless you need to override the default environment URL
4. Open the app and use the `Run Diagnostic` button before submitting a real enquiry

The diagnostic checks:

- BYDA authentication
- Required activity-domain lookups
- Organisation lookup for the selected site polygon when a site is selected

## Notes

- BYDA direct API integration requires approved API access and per-user API keys.
- BYDA UAT and production should be treated as separate environments with separate keys.
- The official BYDA article says the direct API `source` must be `API`, so the implementation submits that value for live lodgements.
- Polling currently aims to produce a combined ZIP download URL. If that is not yet available, the app keeps the enquiry in a processing state and surfaces the BYDA share link when possible.
- QLD, NSW, and VIC attempt to upgrade the site geometry from public cadastral parcel data. If a parcel lookup is unavailable, the app falls back to a small buffered polygon around the resolved point.
- The WordPress package can use the top-level `poller` service as the BYDA credential proxy. In that mode WordPress only needs the poller base URL and shared secret; BYDA API credentials live on the poller runtime. The poller handles live options, organisation lookup, enquiry creation, status/report lookup, and BYDA history search.
