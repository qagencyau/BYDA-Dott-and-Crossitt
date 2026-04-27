# BYDA IET Poller

This service polls BYDA on behalf of the WordPress BYDA IET plugin and posts status updates back to WordPress.

It follows the same service shape as the existing `poller-example`:

- authenticated `POST /start`
- authenticated `GET /options`
- authenticated `POST /organisations/search`
- authenticated `POST /enquiries`
- authenticated `GET /enquiries/search`
- authenticated `GET /enquiries/:id`
- authenticated `GET /enquiries/:id/report`
- authenticated `GET /jobs`
- authenticated `POST /cancel`
- public `GET /health`
- shared-secret callback delivery to WordPress

## Environment variables

- `PORT` (default `8081`)
- `SHARED_SECRET` (required)
- `DEFAULT_CALLBACK_URL` (optional, can be provided per request)
- `BYDA_ENVIRONMENT` (default `production`, options: `production`, `uat`)
- `BYDA_BASE_URL` (optional override)
- `BYDA_CLIENT_ID` (required)
- `BYDA_CLIENT_SECRET` (required)
- `REQUEST_TIMEOUT_MS` (default `20000`)
- `JOB_INITIAL_DELAY_MS` (default `30000` / 30 seconds)
- `JOB_BASE_DELAY_MS` (default `120000` / 2 minutes)
- `JOB_MAX_DELAY_MS` (default `3600000` / 1 hour)
- `JOB_JITTER_MS` (default `60000` / up to 1 minute)
- `JOB_MAX_WINDOW_MS` (default `172800000` / 48 hours)
- `SPACES_ENABLED` (default `false`; set `true` to store completed reports in DigitalOcean Spaces)
- `SPACES_ENDPOINT` (optional, defaults to `https://{SPACES_REGION}.digitaloceanspaces.com`)
- `SPACES_REGION` (default `syd1`)
- `SPACES_BUCKET` (required when Spaces is enabled)
- `SPACES_ACCESS_KEY_ID` (required when Spaces is enabled)
- `SPACES_SECRET_ACCESS_KEY` (required when Spaces is enabled)
- `SPACES_KEY_PREFIX` (default `byda-reports`)
- `SPACES_SIGNED_URL_EXPIRES_SECONDS` (default `604800`, capped at 7 days)
- `SPACES_DOWNLOAD_TIMEOUT_MS` (default `120000`)

## Run locally

```bash
cd poller
npm start
```

Use Node.js 20+.

## Docker

Build from the repository root:

```bash
docker build -t byda-iet-poller ./poller
```

Run locally:

```bash
docker run --rm -p 8081:8081 \
  -e SHARED_SECRET="change-me" \
  -e BYDA_ENVIRONMENT="uat" \
  -e BYDA_CLIENT_ID="..." \
  -e BYDA_CLIENT_SECRET="..." \
  byda-iet-poller
```

Push to Docker Hub:

```bash
docker tag byda-iet-poller your-dockerhub-user/byda-iet-poller:latest
docker push your-dockerhub-user/byda-iet-poller:latest
```

Build, tag, and push with the repository script:

```bash
npm run publish:poller-docker -- --image your-dockerhub-user/byda-iet-poller
```

If Docker Hub already has `v1`, the script publishes `v2`. If no `vN` tags exist, it starts at `v1`. It also tags and pushes `latest` unless `--no-latest` is provided.

For private Docker Hub repositories, set these before running the script so it can read existing tags:

```bash
DOCKERHUB_USERNAME=your-dockerhub-user
DOCKERHUB_TOKEN=your-dockerhub-access-token
```

The publish script automatically loads the repo-root `.env`, so these can also be stored there:

```bash
DOCKER_IMAGE=your-dockerhub-user/byda-iet-poller
DOCKERHUB_USERNAME=your-dockerhub-user
DOCKERHUB_TOKEN=your-dockerhub-access-token
```

With `DOCKER_IMAGE` set, this is enough:

```bash
npm run publish:poller-docker
```

Useful options:

```bash
npm run publish:poller-docker -- --image your-dockerhub-user/byda-iet-poller --tag v1
npm run publish:poller-docker -- --image your-dockerhub-user/byda-iet-poller --no-latest
npm run publish:poller-docker -- --image your-dockerhub-user/byda-iet-poller --dry-run
```

For DigitalOcean, deploy the image as a web service/container and set the HTTP port to the `PORT` environment variable. Configure these runtime environment variables in DigitalOcean, not in the image:

- `SHARED_SECRET`
- `BYDA_ENVIRONMENT`
- `BYDA_CLIENT_ID`
- `BYDA_CLIENT_SECRET`
- `BYDA_BASE_URL` if overriding the environment default
- `REQUEST_TIMEOUT_MS` if required
- `JOB_INITIAL_DELAY_MS` if required
- `JOB_BASE_DELAY_MS` if required
- `JOB_MAX_DELAY_MS` if required
- `JOB_JITTER_MS` if required
- `JOB_MAX_WINDOW_MS` if required
- `SPACES_ENABLED=true` if storing reports in DigitalOcean Spaces
- `SPACES_REGION`
- `SPACES_BUCKET`
- `SPACES_ACCESS_KEY_ID`
- `SPACES_SECRET_ACCESS_KEY`
- `SPACES_KEY_PREFIX` if required
- `SPACES_SIGNED_URL_EXPIRES_SECONDS` if required

## Private report storage

When `SPACES_ENABLED=true`, the poller does not send BYDA's temporary file URL to WordPress as the long-term report URL. Instead it:

1. waits for BYDA to expose the combined PDF file URL;
2. downloads the PDF;
3. uploads it to DigitalOcean Spaces as a private object;
4. sends WordPress a signed Spaces URL plus stable storage metadata.

The callback/report payload includes:

- `fileUrl` - the current signed Spaces URL
- `sourceFileUrl` - the original BYDA file URL seen by the poller
- `storageKey` - the private Spaces object key
- `fileUrlExpiresAt` - when the signed URL expires

WordPress keeps its own stable report route, for example:

```text
/wp-json/byda-iet/v1/enquiries/{tracking-token}/report
```

When that route is opened, WordPress calls `GET /enquiries/:id/report` on the poller. The poller returns a fresh signed URL for the private Spaces object and WordPress redirects the browser to it.

Use `/health` for the health check path.

## Start a job

WordPress normally calls `POST /enquiries`, which creates the BYDA enquiry and starts the polling job in one request. The legacy `POST /start` endpoint remains available for cases where an enquiry was created elsewhere and only needs polling.

Create a BYDA enquiry through the poller:

```bash
curl -X POST http://localhost:8081/enquiries \
  -H "Content-Type: application/json" \
  -H "X-BYDA-IET-Secret: change-me" \
  -d '{
    "token": "uuid-from-wordpress",
    "callbackUrl": "https://your-site.example.com/wp-json/byda-iet/v1/poller-callback",
    "payload": {
      "userReference": "Example",
      "digStartAt": "2026-05-01",
      "digEndAt": "2026-05-02",
      "shape": { "type": "Polygon", "coordinates": [] },
      "isPlanningJob": false,
      "activityTypes": ["MANUAL_EXCAVATION"],
      "locationTypes": ["Private"],
      "locationsInRoad": [],
      "source": "API",
      "Address": {
        "line1": "1 Example Street",
        "locality": "Sydney",
        "state": "NSW",
        "country": "AUS",
        "postcode": 2000
      },
      "userTimezone": "Australia/Sydney"
    }
  }'
```

Start polling an existing BYDA enquiry:

```bash
curl -X POST http://localhost:8081/start \
  -H "Content-Type: application/json" \
  -H "X-BYDA-IET-Secret: change-me" \
  -d '{
    "token": "uuid-from-wordpress",
    "enquiryId": 123456,
    "callbackUrl": "https://your-site.example.com/wp-json/byda-iet/v1/poller-callback"
  }'
```

## Debug active jobs

```bash
curl http://localhost:8081/jobs \
  -H "X-BYDA-IET-Secret: change-me"
```

## Lookup endpoints

Search recent BYDA enquiries:

```bash
curl "http://localhost:8081/enquiries/search?limit=50&createdAfter=2026-01-01" \
  -H "X-BYDA-IET-Secret: change-me"
```

Check a BYDA enquiry:

```bash
curl http://localhost:8081/enquiries/123456 \
  -H "X-BYDA-IET-Secret: change-me"
```

Resolve the current report/share URL:

```bash
curl http://localhost:8081/enquiries/123456/report \
  -H "X-BYDA-IET-Secret: change-me"
```

When Spaces is enabled, this endpoint generates a fresh signed URL for the private object on each request.

## WordPress callback

Configure the same shared secret in the WordPress plugin settings. The poller sends:

- `token`
- `enquiryId`
- `bydaStatus`
- `shareUrl`
- `fileUrl`
- `sourceFileUrl`
- `storageKey`
- `fileUrlExpiresAt`
- `combinedFileId`
- `combinedJobId`
- `pollerStatus`
- `error` when terminal failure occurs

to:

```text
/wp-json/byda-iet/v1/poller-callback
```

## Limitation

Like the original example service, jobs are stored in memory. A process restart clears in-flight jobs.
