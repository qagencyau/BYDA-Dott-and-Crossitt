export class HttpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

function parseBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status} for ${url}`, response.status, body);
  }

  return body;
}

export function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}
