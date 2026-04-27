import http from "http";
import crypto from "crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (typeof fetch !== "function") {
	throw new Error("Missing global fetch(). Use Node.js 20+.");
}

function envNumber(name) {
	const raw = process.env[name];
	if (raw === undefined || raw === null || raw === "") {
		return null;
	}

	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

function envNumberWithFallback(name, fallback) {
	const value = envNumber(name);
	return value === null ? fallback : value;
}

function envBool(name, fallback = false) {
	const raw = process.env[name];
	if (raw === undefined || raw === null || raw === "") {
		return fallback;
	}

	return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function trimTrailingSlash(value) {
	return String(value || "").replace(/\/+$/, "");
}

function trimSlashes(value) {
	return String(value || "").replace(/^\/+|\/+$/g, "");
}

function defaultBydaBaseUrl(environment) {
	return environment === "uat"
		? "https://swx-sentinel-uat.smarterdbyd.com/api"
		: "https://smarterwx.1100.com.au/api";
}

const config = {
	port: Number(process.env.PORT || 8081),
	sharedSecret: process.env.SHARED_SECRET || "",
	defaultCallbackUrl: process.env.DEFAULT_CALLBACK_URL || "",
	bydaEnvironment: String(process.env.BYDA_ENVIRONMENT || "production").toLowerCase() === "uat" ? "uat" : "production",
	bydaBaseUrl: "",
	bydaClientId: process.env.BYDA_CLIENT_ID || "",
	bydaClientSecret: process.env.BYDA_CLIENT_SECRET || "",
	requestTimeoutMs: envNumberWithFallback("REQUEST_TIMEOUT_MS", 20000),
	spaces: {
		enabled: envBool("SPACES_ENABLED", false),
		endpoint: trimTrailingSlash(process.env.SPACES_ENDPOINT || ""),
		region: process.env.SPACES_REGION || "syd1",
		bucket: process.env.SPACES_BUCKET || "",
		accessKeyId: process.env.SPACES_ACCESS_KEY_ID || "",
		secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY || "",
		keyPrefix: trimSlashes(process.env.SPACES_KEY_PREFIX || "byda-reports"),
		signedUrlExpiresSeconds: Math.max(
			60,
			Math.min(envNumberWithFallback("SPACES_SIGNED_URL_EXPIRES_SECONDS", 7 * 24 * 60 * 60), 7 * 24 * 60 * 60),
		),
		downloadTimeoutMs: envNumberWithFallback("SPACES_DOWNLOAD_TIMEOUT_MS", 120000),
	},
};

config.bydaBaseUrl = trimTrailingSlash(process.env.BYDA_BASE_URL || defaultBydaBaseUrl(config.bydaEnvironment));
config.spaces.endpoint = config.spaces.endpoint || `https://${config.spaces.region}.digitaloceanspaces.com`;

const MAX_WINDOW_MS = envNumberWithFallback("JOB_MAX_WINDOW_MS", 48 * 60 * 60 * 1000);
const MAX_DELAY_MS = envNumberWithFallback("JOB_MAX_DELAY_MS", 60 * 60 * 1000);
const BASE_DELAY_MS = envNumberWithFallback("JOB_BASE_DELAY_MS", 2 * 60 * 1000);
const INITIAL_DELAY_MS = envNumberWithFallback("JOB_INITIAL_DELAY_MS", 30 * 1000);
const JITTER_MS = envNumberWithFallback("JOB_JITTER_MS", 60 * 1000);

const jobs = new Map();
let requestSequence = 0;

let tokenCache = {
	accessToken: "",
	expiresAtMs: 0,
};

let spacesClient = null;

function log(message, meta = {}) {
	const stamp = new Date().toISOString();
	const payload = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
	console.log(`[${stamp}] ${message}${payload}`);
}

function urlSummary(value) {
	const raw = String(value || "").trim();
	if (!raw) {
		return { present: false };
	}

	try {
		const url = new URL(raw);
		return {
			present: true,
			protocol: url.protocol.replace(/:$/, ""),
			host: url.host,
			pathname: url.pathname,
			hasQuery: Boolean(url.search),
			length: raw.length,
		};
	} catch {
		return {
			present: true,
			invalid: true,
			length: raw.length,
		};
	}
}

function snapshotSummary(snapshot = {}) {
	return {
		token: snapshot.token || null,
		enquiryId: snapshot.enquiryId ?? null,
		bydaStatus: snapshot.bydaStatus || null,
		pollerStatus: snapshot.pollerStatus || null,
		hasShareUrl: Boolean(snapshot.shareUrl),
		hasFileUrl: Boolean(snapshot.fileUrl),
		hasSourceFileUrl: Boolean(snapshot.sourceFileUrl),
		hasStorageKey: Boolean(snapshot.storageKey),
		fileUrlExpiresAt: snapshot.fileUrlExpiresAt || null,
		combinedFileId: snapshot.combinedFileId || null,
		combinedJobId: snapshot.combinedJobId || null,
		error: snapshot.error || null,
		shareUrl: urlSummary(snapshot.shareUrl),
		fileUrl: urlSummary(snapshot.fileUrl),
		sourceFileUrl: urlSummary(snapshot.sourceFileUrl),
	};
}

function jobSummary(job = {}) {
	return {
		id: job.id || null,
		token: job.token || null,
		enquiryId: job.enquiryId || null,
		status: job.status || null,
		running: Boolean(job.running),
		attempt: job.attempt || 0,
		lastRunAt: job.lastRunAt || 0,
		lastCallbackAt: job.lastCallbackAt || 0,
		lastError: job.lastError || "",
		bydaStatus: job.bydaStatus || "",
		hasShareUrl: Boolean(job.shareUrl),
		hasFileUrl: Boolean(job.fileUrl),
		hasStorageKey: Boolean(job.storageKey),
		fileUrlExpiresAt: job.fileUrlExpiresAt || null,
		combinedFileId: job.combinedFileId || "",
		combinedJobId: job.combinedJobId || "",
		pendingCallback: Boolean(job.pendingSnapshot),
		finalStatus: job.finalStatus || "",
	};
}

function jsonResponse(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload),
	});
	res.end(payload);
}

function parseJsonValue(body) {
	if (!body) {
		return null;
	}

	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

function readJson(req) {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (chunk) => {
			data += chunk;
			if (data.length > 1_000_000) {
				reject(new Error("Payload too large"));
				req.destroy();
			}
		});
		req.on("end", () => {
			if (!data) {
				resolve({});
				return;
			}

			try {
				resolve(JSON.parse(data));
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});
}

function getSecret(req, body) {
	const header = req.headers["x-byda-iet-secret"];
	if (header) {
		return String(Array.isArray(header) ? header[0] : header);
	}

	if (body && body.secret) {
		return String(body.secret);
	}

	return "";
}

function isAuthorized(secret) {
	if (!config.sharedSecret || !secret) {
		return false;
	}

	const candidate = Buffer.from(String(secret));
	const expected = Buffer.from(String(config.sharedSecret));
	if (candidate.length !== expected.length) {
		return false;
	}

	return crypto.timingSafeEqual(candidate, expected);
}

function buildUrl(baseUrl, params = {}) {
	const url = new URL(baseUrl);

	for (const [key, value] of Object.entries(params)) {
		if (value === null || value === undefined || value === "") {
			continue;
		}

		url.searchParams.set(key, String(value));
	}

	return url.toString();
}

async function requestJson(method, url, options = {}) {
	const startedAt = Date.now();
	log("Outbound JSON request starting.", {
		method,
		url: urlSummary(url),
		timeoutMs: Math.max(1000, Number(options.timeoutMs || config.requestTimeoutMs || 20000)),
		hasBody: Boolean(options.body),
		bodyLength: options.body ? String(options.body).length : 0,
		headerNames: Object.keys(options.headers || {}),
	});
	const response = await fetch(url, {
		method,
		headers: options.headers || {},
		body: options.body,
		signal: AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs || config.requestTimeoutMs || 20000))),
	});

	const text = await response.text();
	const payload = parseJsonValue(text);
	log("Outbound JSON response received.", {
		method,
		url: urlSummary(url),
		status: response.status,
		ok: response.ok,
		durationMs: Date.now() - startedAt,
		bodyLength: text.length,
		payloadType: typeof payload,
		payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : null,
	});

	if (!response.ok) {
		const error = new Error(`HTTP ${response.status} for ${url}`);
		error.status = response.status;
		error.body = payload;
		throw error;
	}

	return payload;
}

function extractResponseError(error) {
	if (!error) {
		return "Unknown error";
	}

	if (typeof error === "string") {
		return error;
	}

	if (error instanceof Error && error.message) {
		return error.message;
	}

	return String(error);
}

function getErrorBody(error) {
	if (!error || error.body === undefined || error.body === null) {
		return null;
	}

	if (typeof error.body === "string") {
		return error.body.slice(0, 2000);
	}

	try {
		return JSON.stringify(error.body).slice(0, 2000);
	} catch {
		return String(error.body).slice(0, 2000);
	}
}

function errorLogMeta(error, extra = {}) {
	return {
		...extra,
		status: error && error.status ? error.status : null,
		error: extractResponseError(error),
		body: getErrorBody(error),
	};
}

function requireSpacesConfig() {
	if (!config.spaces.enabled) {
		throw new Error("Spaces storage is disabled.");
	}

	const missing = [];
	for (const key of ["bucket", "accessKeyId", "secretAccessKey", "endpoint", "region"]) {
		if (!config.spaces[key]) {
			missing.push(key);
		}
	}

	if (missing.length) {
		throw new Error(`Spaces storage is enabled but missing config: ${missing.join(", ")}.`);
	}
}

function getSpacesClient() {
	requireSpacesConfig();

	if (!spacesClient) {
		spacesClient = new S3Client({
			endpoint: config.spaces.endpoint,
			region: config.spaces.region,
			credentials: {
				accessKeyId: config.spaces.accessKeyId,
				secretAccessKey: config.spaces.secretAccessKey,
			},
		});
	}

	return spacesClient;
}

function safeKeySegment(value, fallback = "report") {
	const safe = String(value || "")
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return safe || fallback;
}

function getReportFilename(sourceUrl, enquiryId) {
	let filename = "";

	try {
		const url = new URL(sourceUrl);
		for (const key of ["FileName", "filename", "name"]) {
			const value = url.searchParams.get(key);
			if (value) {
				filename = value;
				break;
			}
		}

		if (!filename) {
			const pathName = decodeURIComponent(url.pathname || "");
			filename = pathName.split("/").filter(Boolean).pop() || "";
		}
	} catch {
		filename = "";
	}

	filename = safeKeySegment(filename, "");
	if (!filename || !/\.pdf$/i.test(filename)) {
		filename = `byda-report-${safeKeySegment(enquiryId, "report")}.pdf`;
	}

	return filename;
}

function buildSpacesKey(enquiryId, combinedFileId, sourceUrl) {
	const parts = [
		config.spaces.keyPrefix,
		safeKeySegment(enquiryId, "unknown-enquiry"),
		safeKeySegment(combinedFileId, "combined-report"),
		getReportFilename(sourceUrl, enquiryId),
	].filter(Boolean);

	return parts.join("/");
}

async function spacesObjectExists(key) {
	try {
		await getSpacesClient().send(new HeadObjectCommand({
			Bucket: config.spaces.bucket,
			Key: key,
		}));
		return true;
	} catch (error) {
		const status = Number(error && (error.$metadata && error.$metadata.httpStatusCode));
		if (status === 404 || error.name === "NotFound") {
			return false;
		}

		throw error;
	}
}

async function downloadReport(sourceUrl) {
	const response = await fetch(sourceUrl, {
		headers: {
			Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
			"User-Agent": "BYDA-IET-Poller/1.0",
		},
		signal: AbortSignal.timeout(Math.max(30_000, config.spaces.downloadTimeoutMs)),
	});

	if (!response.ok) {
		const error = new Error(`HTTP ${response.status} while downloading BYDA report.`);
		error.status = response.status;
		throw error;
	}

	const arrayBuffer = await response.arrayBuffer();
	const body = Buffer.from(arrayBuffer);
	if (!body.length) {
		throw new Error("Downloaded BYDA report payload is empty.");
	}

	return {
		body,
		contentType: response.headers.get("content-type") || "application/pdf",
	};
}

async function uploadReportToSpaces(key, sourceUrl, enquiryId, combinedFileId) {
	if (await spacesObjectExists(key)) {
		return;
	}

	const report = await downloadReport(sourceUrl);
	const filename = getReportFilename(sourceUrl, enquiryId);
	const metadata = {};
	if (enquiryId) {
		metadata["byda-enquiry-id"] = String(enquiryId);
	}
	if (combinedFileId) {
		metadata["byda-combined-file-id"] = String(combinedFileId);
	}

	await getSpacesClient().send(new PutObjectCommand({
		Bucket: config.spaces.bucket,
		Key: key,
		Body: report.body,
		ContentType: report.contentType || "application/pdf",
		ContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
		ACL: "private",
		Metadata: metadata,
	}));
}

async function signSpacesReport(key) {
	const expiresIn = config.spaces.signedUrlExpiresSeconds;
	const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
	const url = await getSignedUrl(
		getSpacesClient(),
		new GetObjectCommand({
			Bucket: config.spaces.bucket,
			Key: key,
		}),
		{ expiresIn },
	);

	return {
		url,
		expiresAt,
	};
}

function signedUrlIsFresh(expiresAt) {
	const timestamp = Date.parse(String(expiresAt || ""));
	return Number.isFinite(timestamp) && timestamp - Date.now() > 5 * 60 * 1000;
}

async function resolveReportStorage(enquiryId, combinedFileId, sourceFileUrl, existing = {}) {
	log("Report storage resolution started.", {
		enquiryId,
		combinedFileId: combinedFileId || null,
		sourceFileUrl: urlSummary(sourceFileUrl),
		spacesEnabled: config.spaces.enabled,
		existing: {
			hasFileUrl: Boolean(existing.fileUrl),
			hasSourceFileUrl: Boolean(existing.sourceFileUrl),
			hasStorageKey: Boolean(existing.storageKey),
			fileUrlExpiresAt: existing.fileUrlExpiresAt || null,
		},
	});
	if (!sourceFileUrl) {
		log("Report storage resolution has no source file URL yet.", {
			enquiryId,
			combinedFileId: combinedFileId || null,
		});
		return {
			fileUrl: "",
			sourceFileUrl: existing.sourceFileUrl || "",
			storageKey: existing.storageKey || "",
			fileUrlExpiresAt: existing.fileUrlExpiresAt || null,
		};
	}

	if (!config.spaces.enabled) {
		log("Report storage resolution returning BYDA source URL directly.", {
			enquiryId,
			combinedFileId: combinedFileId || null,
			sourceFileUrl: urlSummary(sourceFileUrl),
		});
		return {
			fileUrl: sourceFileUrl,
			sourceFileUrl,
			storageKey: null,
			fileUrlExpiresAt: null,
		};
	}

	const storageKey = existing.storageKey || buildSpacesKey(enquiryId, combinedFileId, sourceFileUrl);
	if (existing.fileUrl && existing.storageKey === storageKey && signedUrlIsFresh(existing.fileUrlExpiresAt)) {
		log("Report storage resolution reusing existing fresh signed URL.", {
			enquiryId,
			combinedFileId: combinedFileId || null,
			storageKey,
			fileUrl: urlSummary(existing.fileUrl),
			fileUrlExpiresAt: existing.fileUrlExpiresAt || null,
		});
		return {
			fileUrl: existing.fileUrl,
			sourceFileUrl: existing.sourceFileUrl || sourceFileUrl,
			storageKey,
			fileUrlExpiresAt: existing.fileUrlExpiresAt,
		};
	}

	await uploadReportToSpaces(storageKey, sourceFileUrl, enquiryId, combinedFileId);
	const signed = await signSpacesReport(storageKey);
	log("Report storage resolution uploaded/signed Spaces report.", {
		enquiryId,
		combinedFileId: combinedFileId || null,
		storageKey,
		fileUrl: urlSummary(signed.url),
		fileUrlExpiresAt: signed.expiresAt,
	});

	return {
		fileUrl: signed.url,
		sourceFileUrl,
		storageKey,
		fileUrlExpiresAt: signed.expiresAt,
	};
}

function calculateBackoff(attempt) {
	const delay = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
	const jitter = Math.floor(Math.random() * Math.max(0, JITTER_MS));
	return Math.min(delay + jitter, MAX_DELAY_MS);
}

function scheduleJob(jobId, delayMs) {
	const job = jobs.get(jobId);
	if (!job || job.status !== "pending") {
		log("Schedule job skipped.", {
			jobId,
			delayMs,
			hasJob: Boolean(job),
			job: job ? jobSummary(job) : null,
		});
		return;
	}

	log("Schedule job timer set.", {
		job: jobSummary(job),
		delayMs,
		runAt: new Date(Date.now() + delayMs).toISOString(),
	});
	setTimeout(() => {
		void runJob(jobId);
	}, delayMs);
}

function getJobStats() {
	let activeJobs = 0;
	for (const job of jobs.values()) {
		if (job && ["creating", "pending"].includes(job.status)) {
			activeJobs += 1;
		}
	}

	return {
		activeJobs,
		totalJobs: jobs.size,
	};
}

function getTokenCacheIsValid() {
	return tokenCache.accessToken && tokenCache.expiresAtMs - Date.now() > 60_000;
}

async function getBydaAccessToken() {
	if (getTokenCacheIsValid()) {
		return tokenCache.accessToken;
	}

	if (!config.bydaClientId || !config.bydaClientSecret) {
		throw new Error("BYDA credentials missing. Set BYDA_CLIENT_ID and BYDA_CLIENT_SECRET.");
	}

	const response = await requestJson("POST", `${config.bydaBaseUrl}/community/auth/tokens`, {
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			clientId: config.bydaClientId,
			clientSecret: config.bydaClientSecret,
		}),
	});

	const accessToken = response && typeof response === "object" ? String(response.access_token || "") : "";
	if (!accessToken) {
		throw new Error("BYDA authentication did not return an access token.");
	}

	const expiryMs =
		response && typeof response === "object" && response.expiry
			? Date.parse(String(response.expiry))
			: Date.now() + 45 * 60 * 1000;

	tokenCache = {
		accessToken,
		expiresAtMs: Number.isFinite(expiryMs) ? expiryMs : Date.now() + 45 * 60 * 1000,
	};

	return accessToken;
}

function clearBydaAccessToken() {
	tokenCache = {
		accessToken: "",
		expiresAtMs: 0,
	};
}

async function bydaRequest(method, pathname, body = null, query = null, hasRetried = false) {
	const token = await getBydaAccessToken();
	const url = buildUrl(`${config.bydaBaseUrl}${pathname}`, query || {});

	try {
		return await requestJson(method, url, {
			headers: {
				Authorization: token,
				"Content-Type": "application/json",
			},
			body: body === null ? undefined : JSON.stringify(body),
		});
	} catch (error) {
		if (error && error.status === 401 && !hasRetried) {
			clearBydaAccessToken();
			return bydaRequest(method, pathname, body, query, true);
		}

		throw error;
	}
}

async function bydaGetEnquiry(enquiryId) {
	return bydaRequest("GET", `/enquiries/${encodeURIComponent(String(enquiryId))}`);
}

function unwrapBydaEnquiryResponse(response) {
	if (!response || typeof response !== "object") {
		return response;
	}

	if (response.Enquiry && typeof response.Enquiry === "object") {
		return response.Enquiry;
	}
	if (response.enquiry && typeof response.enquiry === "object") {
		return response.enquiry;
	}

	return response;
}

async function bydaSearchEnquiries(args = {}) {
	const query = {
		limit: Number(args.limit || 20),
		offset: Number(args.offset || 0),
		order: "-createdAt",
		fields: "id,externalId,userReference,status,createdAt,updatedAt,digStartAt,digEndAt",
		include: "Address",
		returnGeometry: "false",
	};

	if (args.createdAfter) {
		query.filter = `createdAfter:${args.createdAfter}`;
	}

	const response = await bydaRequest("GET", "/enquiries", null, query);
	const records = response && typeof response === "object" && Array.isArray(response.Enquiries)
		? response.Enquiries
		: [];

	return {
		info: response && typeof response === "object" && response.Info && typeof response.Info === "object"
			? response.Info
			: {
				offset: query.offset,
				limit: query.limit,
				count: records.length,
			},
		enquiries: records.map((record) => ({
			enquiryId: record.id ?? null,
			externalId: record.externalId ?? null,
			bydaStatus: record.status ?? null,
			userReference: record.userReference ?? null,
			createdAt: record.createdAt ?? null,
			updatedAt: record.updatedAt ?? null,
			digStartAt: record.digStartAt ?? null,
			digEndAt: record.digEndAt ?? null,
			addressLabel: formatAddressLabel(record.Address),
			address: record.Address && typeof record.Address === "object" ? record.Address : null,
		})),
	};
}

async function bydaGetShareLink(enquiryId) {
	const response = await bydaRequest("GET", `/enquiries/${encodeURIComponent(String(enquiryId))}/sharelink`);
	if (typeof response === "string") {
		return response;
	}

	return response && typeof response === "object" ? String(response.url || "") : "";
}

async function bydaRequestCombinedPdf(enquiryId) {
	return bydaRequest("GET", `/enquiries/${encodeURIComponent(String(enquiryId))}/files/download/pdf`);
}

async function bydaCreateEnquiry(payload) {
	return bydaRequest("POST", "/enquiries", payload);
}

async function bydaGetDomainValues(domainName) {
	const response = await bydaRequest("GET", `/system/domains/${encodeURIComponent(String(domainName))}`);
	const records = Array.isArray(response)
		? response
		: response && typeof response === "object" && Array.isArray(response.Values)
			? response.Values
			: response && typeof response === "object" && Array.isArray(response.DomainValues)
				? response.DomainValues
				: response && typeof response === "object" && Array.isArray(response.values)
					? response.values
					: [];

	return records
		.map((record) => {
			if (!record || typeof record !== "object") {
				return null;
			}

			const code = record.value || record.code || record.name || "";
			const label = record.label || record.name || record.value || code;
			if (!code || !label) {
				return null;
			}

			return {
				code,
				label,
				sequence: record.sequence ?? null,
			};
		})
		.filter(Boolean)
		.sort((left, right) => Number(left.sequence ?? 9999) - Number(right.sequence ?? 9999));
}

async function bydaGetOptionsPayload() {
	const [planning, excavation] = await Promise.all([
		bydaGetDomainValues("ENQ_ACT_DESIGN"),
		bydaGetDomainValues("ENQ_ACT_EXCAVATE"),
	]);

	return {
		mode: "live",
		optionsSource: "live",
		planningActivityTypes: planning,
		excavationActivityTypes: excavation,
		locationTypes: ["Road Reserve", "Private"],
		locationsInRoad: ["Road", "Nature Strip", "Footpath"],
		byda: {
			mode: "live",
			proxy: "poller",
			environment: config.bydaEnvironment,
			baseUrl: config.bydaBaseUrl,
			hasClientId: !!config.bydaClientId,
			hasClientSecret: !!config.bydaClientSecret,
			requestTimeoutMs: config.requestTimeoutMs,
		},
		storage: {
			provider: config.spaces.enabled ? "digitalocean-spaces" : "byda",
			signedUrls: config.spaces.enabled,
			bucket: config.spaces.enabled ? config.spaces.bucket : null,
			region: config.spaces.enabled ? config.spaces.region : null,
			keyPrefix: config.spaces.enabled ? config.spaces.keyPrefix : null,
			signedUrlExpiresSeconds: config.spaces.enabled ? config.spaces.signedUrlExpiresSeconds : null,
		},
	};
}

async function bydaGetOrganisations(polygon) {
	const coordinates = polygon && Array.isArray(polygon.coordinates) ? polygon.coordinates : [];
	const extentCandidates = [
		coordinates,
		Array.isArray(coordinates[0]) ? coordinates[0] : null,
		polygon && typeof polygon === "object" ? polygon : null,
	].filter(Boolean);
	let response = null;
	let lastError = null;

	for (const extent of extentCandidates) {
		try {
			response = await bydaRequest(
				"GET",
				"/community/organisations",
				null,
				{
					extent: JSON.stringify(extent),
					fields: "id,name,organisationType",
					limit: 50,
				},
			);
			break;
		} catch (error) {
			lastError = error;
			if (Number(error && error.status) !== 400) {
				throw error;
			}
		}
	}

	if (!response) {
		throw lastError || new Error("Organisation lookup failed.");
	}
	const organisations = response && typeof response === "object" && Array.isArray(response.Organisations)
		? response.Organisations
		: [];

	return organisations.map((organisation) => ({
		id: organisation.id ?? null,
		name: organisation.name || "",
		organisationType: organisation.organisationType || "",
	}));
}

function formatAddressLabel(address) {
	if (!address || typeof address !== "object") {
		return null;
	}

	const parts = ["line1", "line2", "locality", "state", "postcode"]
		.map((key) => address[key])
		.filter((value) => value !== null && value !== undefined && String(value).trim() !== "");

	return parts.length ? parts.join(", ") : null;
}

async function bydaGetFileUrl(fileId) {
	const response = await bydaRequest(
		"GET",
		`/system/files/${encodeURIComponent(String(fileId))}`,
		null,
		{ format: "url" },
	);
	if (typeof response === "string") {
		return response;
	}

	if (response && typeof response === "object") {
		if (response.downloadURL) {
			return String(response.downloadURL);
		}
		if (response.url) {
			return String(response.url);
		}
	}

	return "";
}

async function bydaProbeFileUrl(fileId) {
	try {
		const url = await bydaGetFileUrl(fileId);
		return url || null;
	} catch (error) {
		if (error && [400, 404, 409].includes(Number(error.status))) {
			return null;
		}

		throw error;
	}
}

function canRequestCombinedReport(bydaStatus, combinedFileId, combinedJobId) {
	return String(bydaStatus || "").trim().toUpperCase() === "ALL_RECEIVED" || !!combinedFileId || !!combinedJobId;
}

async function bydaGetStatusSnapshot(enquiryId, existing = {}) {
	log("BYDA status snapshot started.", {
		enquiryId,
		existing: {
			bydaStatus: existing.bydaStatus || "",
			hasShareUrl: Boolean(existing.shareUrl),
			hasFileUrl: Boolean(existing.fileUrl),
			hasSourceFileUrl: Boolean(existing.sourceFileUrl),
			hasStorageKey: Boolean(existing.storageKey),
			combinedFileId: existing.combinedFileId || "",
			combinedJobId: existing.combinedJobId || "",
		},
	});
	const detail = unwrapBydaEnquiryResponse(await bydaGetEnquiry(enquiryId));
	const bydaStatus = detail && typeof detail === "object" ? String(detail.status || existing.bydaStatus || "") : String(existing.bydaStatus || "");
	log("BYDA enquiry detail loaded.", {
		enquiryId,
		detailId: detail && detail.id ? detail.id : null,
		externalId: detail && detail.externalId ? detail.externalId : null,
		bydaStatus,
		userReference: detail && detail.userReference ? detail.userReference : null,
		createdAt: detail && detail.createdAt ? detail.createdAt : null,
		updatedAt: detail && detail.updatedAt ? detail.updatedAt : null,
		detailKeys: detail && typeof detail === "object" ? Object.keys(detail) : null,
	});

	let shareUrl = existing.shareUrl || "";
	if (!shareUrl) {
		try {
			shareUrl = await bydaGetShareLink(enquiryId);
			log("BYDA share link loaded.", {
				enquiryId,
				shareUrl: urlSummary(shareUrl),
			});
		} catch (error) {
			log("Share link lookup failed.", {
				enquiryId,
				error: extractResponseError(error),
			});
		}
	}

	let combinedFileId = existing.combinedFileId || "";
	let combinedJobId = existing.combinedJobId || "";
	if (!combinedFileId && canRequestCombinedReport(bydaStatus, combinedFileId, combinedJobId)) {
		log("Combined PDF request is allowed; requesting combined report.", {
			enquiryId,
			bydaStatus,
			combinedFileId,
			combinedJobId,
		});
		try {
			const combined = await bydaRequestCombinedPdf(enquiryId);
			if (combined && typeof combined === "object") {
				combinedFileId = combined.File && combined.File.id ? String(combined.File.id) : combinedFileId;
				combinedJobId = combined.Job && combined.Job.id ? String(combined.Job.id) : combinedJobId;
			}
			log("Combined PDF request returned.", {
				enquiryId,
				combinedKeys: combined && typeof combined === "object" ? Object.keys(combined) : null,
				combinedFileId,
				combinedJobId,
			});
		} catch (error) {
			log("Combined PDF request not ready yet.", {
				enquiryId,
				error: extractResponseError(error),
			});
		}
	}

	let sourceFileUrl = existing.sourceFileUrl || (!config.spaces.enabled ? existing.fileUrl || "" : "");
	if (combinedFileId && !sourceFileUrl) {
		log("Probing BYDA file URL for combined file.", {
			enquiryId,
			combinedFileId,
		});
		sourceFileUrl = (await bydaProbeFileUrl(combinedFileId)) || "";
		log("BYDA file URL probe completed.", {
			enquiryId,
			combinedFileId,
			sourceFileUrl: urlSummary(sourceFileUrl),
		});
	}

	const reportStorage = await resolveReportStorage(enquiryId, combinedFileId, sourceFileUrl, existing);
	const fileUrl = reportStorage.fileUrl || "";

	const snapshot = {
		enquiryId: detail && detail.id ? detail.id : enquiryId,
		externalId: detail && detail.externalId ? detail.externalId : null,
		bydaStatus: bydaStatus || null,
		shareUrl: shareUrl || null,
		fileUrl: fileUrl || null,
		sourceFileUrl: reportStorage.sourceFileUrl || sourceFileUrl || null,
		storageKey: reportStorage.storageKey || null,
		fileUrlExpiresAt: reportStorage.fileUrlExpiresAt || null,
		readyUrl: fileUrl || shareUrl || null,
		combinedFileId: combinedFileId || null,
		combinedJobId: combinedJobId || null,
		detail,
		addressLabel: detail && detail.Address ? formatAddressLabel(detail.Address) : null,
		userReference: detail && detail.userReference ? detail.userReference : null,
		createdAt: detail && detail.createdAt ? detail.createdAt : null,
		updatedAt: detail && detail.updatedAt ? detail.updatedAt : null,
		status: fileUrl ? "ready" : "processing",
		pollerStatus: fileUrl ? "completed" : "polling",
	};
	log("BYDA status snapshot resolved.", {
		enquiryId,
		snapshot: snapshotSummary(snapshot),
	});

	return snapshot;
}

function buildSnapshot(job, overrides = {}) {
	return {
		token: job.token,
		enquiryId: job.enquiryId
			? (Number.isFinite(Number(job.enquiryId)) ? Number(job.enquiryId) : String(job.enquiryId))
			: null,
		bydaStatus: overrides.bydaStatus ?? job.bydaStatus ?? null,
		shareUrl: overrides.shareUrl ?? job.shareUrl ?? null,
		fileUrl: overrides.fileUrl ?? job.fileUrl ?? null,
		sourceFileUrl: overrides.sourceFileUrl ?? job.sourceFileUrl ?? null,
		storageKey: overrides.storageKey ?? job.storageKey ?? null,
		fileUrlExpiresAt: overrides.fileUrlExpiresAt ?? job.fileUrlExpiresAt ?? null,
		combinedFileId: overrides.combinedFileId ?? job.combinedFileId ?? null,
		combinedJobId: overrides.combinedJobId ?? job.combinedJobId ?? null,
		pollerStatus: overrides.pollerStatus ?? "polling",
		error: overrides.error ?? null,
	};
}

function snapshotHash(snapshot) {
	return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function isTerminalSnapshot(snapshot) {
	if (!snapshot || typeof snapshot !== "object") {
		return false;
	}

	const status = String(snapshot.pollerStatus || "").toLowerCase();
	return !!snapshot.fileUrl || ["completed", "failed", "expired", "cancelled"].includes(status);
}

async function sendCallback(job, snapshot) {
	const payload = {
		...snapshot,
		polledAt: new Date().toISOString(),
	};

	const startedAt = Date.now();
	log("WordPress callback sending.", {
		job: jobSummary(job),
		callbackUrl: urlSummary(job.callbackUrl),
		snapshot: snapshotSummary(snapshot),
		payloadKeys: Object.keys(payload),
	});
	const response = await fetch(job.callbackUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-BYDA-IET-Secret": config.sharedSecret,
		},
		body: JSON.stringify(payload),
	});

	const text = await response.text();
	const json = parseJsonValue(text);

	if (!response.ok) {
		log("Poller callback failed.", {
			token: job.token,
			enquiryId: job.enquiryId,
			status: response.status,
			durationMs: Date.now() - startedAt,
			body: typeof text === "string" ? text.slice(0, 1000) : "",
		});
	} else {
		log("WordPress callback accepted.", {
			token: job.token,
			enquiryId: job.enquiryId,
			status: response.status,
			durationMs: Date.now() - startedAt,
			responseKeys: json && typeof json === "object" ? Object.keys(json) : null,
			responseStatus: json && typeof json === "object" ? json.status || null : null,
			responseReportUrl: json && typeof json === "object" ? urlSummary(json.reportUrl) : null,
		});
	}

	return {
		ok: response.ok,
		status: response.status,
		text,
		json,
	};
}

async function pollBydaEnquiry(job) {
	log("Polling BYDA enquiry for job.", {
		job: jobSummary(job),
	});
	const status = await bydaGetStatusSnapshot(job.enquiryId, job);

	job.bydaStatus = status.bydaStatus || "";
	job.shareUrl = status.shareUrl || "";
	job.combinedFileId = status.combinedFileId || "";
	job.combinedJobId = status.combinedJobId || "";
	job.fileUrl = status.fileUrl || "";
	job.sourceFileUrl = status.sourceFileUrl || "";
	job.storageKey = status.storageKey || "";
	job.fileUrlExpiresAt = status.fileUrlExpiresAt || null;

	const snapshot = buildSnapshot(job, {
		bydaStatus: status.bydaStatus || null,
		shareUrl: status.shareUrl || null,
		fileUrl: status.fileUrl || null,
		sourceFileUrl: status.sourceFileUrl || null,
		storageKey: status.storageKey || null,
		fileUrlExpiresAt: status.fileUrlExpiresAt || null,
		combinedFileId: status.combinedFileId || null,
		combinedJobId: status.combinedJobId || null,
		pollerStatus: status.fileUrl ? "completed" : "polling",
		error: null,
	});
	log("Polling BYDA enquiry produced snapshot.", {
		job: jobSummary(job),
		snapshot: snapshotSummary(snapshot),
	});
	return snapshot;
}

async function runJob(jobId) {
	const job = jobs.get(jobId);
	if (!job || job.running || job.status !== "pending") {
		log("Run job skipped.", {
			jobId,
			hasJob: Boolean(job),
			job: job ? jobSummary(job) : null,
		});
		return;
	}

	job.running = true;
	job.lastRunAt = Date.now();
	job.attempt += 1;
	log("Run job started.", {
		job: jobSummary(job),
		maxWindowMs: MAX_WINDOW_MS,
	});

	try {
		if (job.pendingSnapshot) {
			log("Run job delivering pending snapshot before polling.", {
				job: jobSummary(job),
				snapshot: snapshotSummary(job.pendingSnapshot),
				finalStatus: job.finalStatus || "",
			});
			const delivery = await sendCallback(job, job.pendingSnapshot);
			if (!delivery.ok) {
				job.lastError = `Callback HTTP ${delivery.status}`;
				job.running = false;
				scheduleJob(jobId, calculateBackoff(job.attempt));
				return;
			}

			job.lastDeliveredHash = snapshotHash(job.pendingSnapshot);
			job.lastCallbackAt = Date.now();

			const finalStatus = job.finalStatus || (isTerminalSnapshot(job.pendingSnapshot) ? String(job.pendingSnapshot.pollerStatus || "completed") : "");
			job.pendingSnapshot = null;
			job.finalStatus = "";

			if (finalStatus) {
				job.status = job.fileUrl ? "completed" : finalStatus;
				job.running = false;
				log("Job completed from pending callback.", {
					token: job.token,
					enquiryId: job.enquiryId,
					status: job.status,
				});
				return;
			}
		}

		if (Date.now() - job.createdAt > MAX_WINDOW_MS) {
			const terminalSnapshot = buildSnapshot(job, {
				pollerStatus: "expired",
				error: "Combined BYDA report was not ready before the poll window expired.",
			});
			const delivery = await sendCallback(job, terminalSnapshot);

			if (!delivery.ok) {
				job.pendingSnapshot = terminalSnapshot;
				job.finalStatus = "expired";
				job.lastError = `Callback HTTP ${delivery.status}`;
				job.running = false;
				scheduleJob(jobId, calculateBackoff(job.attempt));
				return;
			}

			job.lastDeliveredHash = snapshotHash(terminalSnapshot);
			job.lastCallbackAt = Date.now();
			job.status = "expired";
			job.running = false;
			log("Job expired.", {
				token: job.token,
				enquiryId: job.enquiryId,
			});
			return;
		}

		const snapshot = await pollBydaEnquiry(job);
		const hash = snapshotHash(snapshot);
		log("Run job snapshot hash computed.", {
			job: jobSummary(job),
			snapshot: snapshotSummary(snapshot),
			hash,
			lastDeliveredHash: job.lastDeliveredHash,
			changed: hash !== job.lastDeliveredHash,
		});

		if (hash !== job.lastDeliveredHash) {
			const delivery = await sendCallback(job, snapshot);
			if (!delivery.ok) {
				job.pendingSnapshot = snapshot;
				job.finalStatus = isTerminalSnapshot(snapshot) ? String(snapshot.pollerStatus || "completed") : "";
				job.lastError = `Callback HTTP ${delivery.status}`;
				job.running = false;
				scheduleJob(jobId, calculateBackoff(job.attempt));
				return;
			}

			job.lastDeliveredHash = hash;
			job.lastCallbackAt = Date.now();
		}

		job.lastError = "";
		if (snapshot.fileUrl) {
			job.status = "completed";
			job.running = false;
			log("Job completed.", {
				token: job.token,
				enquiryId: job.enquiryId,
				bydaStatus: snapshot.bydaStatus,
			});
			return;
		}
	} catch (error) {
		job.lastError = extractResponseError(error);
		log("Job error.", {
			token: job.token,
			enquiryId: job.enquiryId,
			error: job.lastError,
		});
	}

	job.running = false;
	const delayMs = calculateBackoff(job.attempt);
	log("Run job scheduling next attempt.", {
		job: jobSummary(job),
		delayMs,
	});
	scheduleJob(jobId, delayMs);
}

function startJob(payload) {
	const token = String(payload && payload.token ? payload.token : "").trim();
	const enquiryId = String(payload && payload.enquiryId ? payload.enquiryId : "").trim();
	const callbackUrl = String(payload && payload.callbackUrl ? payload.callbackUrl : config.defaultCallbackUrl).trim();

	if (!token) {
		throw new Error("Missing token");
	}
	if (!enquiryId) {
		throw new Error("Missing enquiryId");
	}
	if (!callbackUrl) {
		throw new Error("Missing callbackUrl");
	}

	const existing = jobs.get(token);
	if (existing && existing.status === "pending") {
		existing.enquiryId = enquiryId;
		existing.callbackUrl = callbackUrl;
		existing.lastError = "";
		log("Existing job reused.", {
			token,
			enquiryId,
		});
		return {
			jobIds: [existing.id],
			jobDetails: [
				{
					jobId: existing.id,
					token,
					enquiryId,
				},
			],
		};
	}

	const job = {
		id: token,
		token,
		enquiryId,
		callbackUrl,
		createdAt: Date.now(),
		lastRunAt: 0,
		lastCallbackAt: 0,
		lastError: "",
		attempt: 0,
		status: "pending",
		running: false,
		pendingSnapshot: null,
		finalStatus: "",
		bydaStatus: "",
		shareUrl: "",
		fileUrl: "",
		sourceFileUrl: "",
		storageKey: "",
		fileUrlExpiresAt: null,
		combinedFileId: "",
		combinedJobId: "",
		lastDeliveredHash: "",
	};

	jobs.set(token, job);
	scheduleJob(token, INITIAL_DELAY_MS);

	log("Job scheduled.", {
		token,
		enquiryId,
		callbackUrl,
	});

	return {
		jobIds: [job.id],
		jobDetails: [
			{
				jobId: job.id,
				token,
				enquiryId,
			},
		],
	};
}

function startCreateJob(payload) {
	const token = String(payload && payload.token ? payload.token : "").trim();
	const callbackUrl = String(payload && payload.callbackUrl ? payload.callbackUrl : config.defaultCallbackUrl).trim();
	const bydaPayload = payload && payload.payload && typeof payload.payload === "object" ? payload.payload : null;

	if (!token) {
		throw new Error("Missing token");
	}
	if (!callbackUrl) {
		throw new Error("Missing callbackUrl");
	}
	if (!bydaPayload) {
		throw new Error("Missing payload");
	}

	const existing = jobs.get(token);
	if (existing && ["creating", "pending"].includes(existing.status)) {
		existing.callbackUrl = callbackUrl;
		existing.createPayload = existing.createPayload || bydaPayload;
		existing.lastError = "";
		log("Existing create job reused.", {
			token,
			enquiryId: existing.enquiryId || null,
			status: existing.status,
		});
		return {
			jobIds: [existing.id],
			jobDetails: [
				{
					jobId: existing.id,
					token,
					enquiryId: existing.enquiryId || null,
					status: existing.status,
				},
			],
		};
	}

	const job = {
		id: token,
		token,
		enquiryId: "",
		callbackUrl,
		createPayload: bydaPayload,
		createdAt: Date.now(),
		lastRunAt: 0,
		lastCallbackAt: 0,
		lastError: "",
		attempt: 0,
		status: "creating",
		running: false,
		pendingSnapshot: null,
		finalStatus: "",
		bydaStatus: "",
		shareUrl: "",
		fileUrl: "",
		sourceFileUrl: "",
		storageKey: "",
		fileUrlExpiresAt: null,
		combinedFileId: "",
		combinedJobId: "",
		lastDeliveredHash: "",
	};

	jobs.set(token, job);
	setTimeout(() => {
		void runCreateJob(token);
	}, 0);

	log("Create job scheduled.", {
		job: jobSummary(job),
		callbackUrl: urlSummary(callbackUrl),
		payloadSummary: {
			userReference: bydaPayload.userReference || null,
			digStartAt: bydaPayload.digStartAt || null,
			digEndAt: bydaPayload.digEndAt || null,
			isPlanningJob: Boolean(bydaPayload.isPlanningJob),
			activityTypes: bydaPayload.activityTypes || [],
			locationTypes: bydaPayload.locationTypes || [],
			authorityId: bydaPayload.authorityId || null,
			otherAuthorityName: bydaPayload.otherAuthorityName || null,
			hasShape: Boolean(bydaPayload.shape),
		},
	});

	return {
		jobIds: [job.id],
		jobDetails: [
			{
				jobId: job.id,
				token,
				enquiryId: null,
				status: job.status,
			},
		],
	};
}

async function runCreateJob(jobId) {
	const job = jobs.get(jobId);
	if (!job || job.running || job.status !== "creating") {
		log("Create job run skipped.", {
			jobId,
			hasJob: Boolean(job),
			job: job ? jobSummary(job) : null,
		});
		return;
	}

	job.running = true;
	job.lastRunAt = Date.now();
	job.attempt += 1;
	log("Create job run started.", {
		job: jobSummary(job),
		payloadSummary: job.createPayload ? {
			userReference: job.createPayload.userReference || null,
			digStartAt: job.createPayload.digStartAt || null,
			digEndAt: job.createPayload.digEndAt || null,
			isPlanningJob: Boolean(job.createPayload.isPlanningJob),
			activityTypes: job.createPayload.activityTypes || [],
			locationTypes: job.createPayload.locationTypes || [],
			authorityId: job.createPayload.authorityId || null,
			otherAuthorityName: job.createPayload.otherAuthorityName || null,
			hasShape: Boolean(job.createPayload.shape),
		} : null,
	});

	try {
		const created = unwrapBydaEnquiryResponse(await bydaCreateEnquiry(job.createPayload));
		log("BYDA create enquiry response received.", {
			job: jobSummary(job),
			createdKeys: created && typeof created === "object" ? Object.keys(created) : null,
			enquiryId: created && created.id ? String(created.id) : "",
			status: created && created.status ? String(created.status) : "",
			externalId: created && created.externalId ? String(created.externalId) : "",
		});
		const enquiryId = created && created.id ? String(created.id) : "";
		if (!enquiryId) {
			const error = new Error("BYDA enquiry creation did not return an enquiry id.");
			error.body = created;
			throw error;
		}

		job.enquiryId = enquiryId;
		job.bydaStatus = created && created.status ? String(created.status) : "CREATED";
		job.status = "pending";
		job.running = false;
		job.createPayload = null;

		const snapshot = buildSnapshot(job, {
			bydaStatus: job.bydaStatus,
			pollerStatus: "polling",
			error: null,
		});
		log("Create job built initial polling snapshot.", {
			job: jobSummary(job),
			snapshot: snapshotSummary(snapshot),
		});
		const delivery = await sendCallback(job, snapshot);
		if (delivery.ok) {
			job.lastDeliveredHash = snapshotHash(snapshot);
			job.lastCallbackAt = Date.now();
		} else {
			job.pendingSnapshot = snapshot;
			job.lastError = `Callback HTTP ${delivery.status}`;
		}

		log("BYDA enquiry created.", {
			job: jobSummary(job),
		});
		scheduleJob(jobId, INITIAL_DELAY_MS);
	} catch (error) {
		job.lastError = extractResponseError(error);
		const terminalSnapshot = buildSnapshot(job, {
			pollerStatus: "failed",
			error: job.lastError,
		});
		log("Create job built failure snapshot.", {
			job: jobSummary(job),
			snapshot: snapshotSummary(terminalSnapshot),
		});

		try {
			await sendCallback(job, terminalSnapshot);
		} catch (callbackError) {
			log("Create failure callback failed.", errorLogMeta(callbackError, { token: job.token }));
		}

		job.status = "failed";
		job.running = false;
		log("BYDA enquiry create job failed.", errorLogMeta(error, { token: job.token }));
	}
}

function cancelJobs(token = "") {
	let cancelled = 0;

	for (const job of jobs.values()) {
		if (!job || !["creating", "pending"].includes(job.status)) {
			continue;
		}
		if (token && job.token !== token) {
			continue;
		}

		job.status = "cancelled";
		job.running = false;
		job.pendingSnapshot = null;
		job.finalStatus = "cancelled";
		cancelled += 1;
	}

	return cancelled;
}

function jsonError(res, status, error) {
	return jsonResponse(res, status, { error: extractResponseError(error) });
}

function errorStatus(error, fallback = 500) {
	const status = Number(error && error.status);
	return Number.isInteger(status) && status >= 400 && status < 600 ? status : fallback;
}

const server = http.createServer(async (req, res) => {
	const { method } = req;
	const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
	const pathname = requestUrl.pathname;
	const requestId = ++requestSequence;
	const requestStartedAt = Date.now();
	res.on("finish", () => {
		log("HTTP request finished.", {
			requestId,
			method,
			pathname,
			statusCode: res.statusCode,
			durationMs: Date.now() - requestStartedAt,
		});
	});
	log("HTTP request received.", {
		requestId,
		method,
		pathname,
		queryKeys: Array.from(requestUrl.searchParams.keys()),
		hasSecretHeader: Boolean(req.headers["x-byda-iet-secret"]),
	});

	if (method === "GET" && pathname === "/health") {
		return jsonResponse(res, 200, {
			ok: true,
			...getJobStats(),
		});
	}

	if (method === "GET" && pathname === "/jobs") {
		const secret = getSecret(req);
		if (!isAuthorized(secret)) {
			return jsonResponse(res, 401, { error: "Unauthorized" });
		}

		const snapshot = Array.from(jobs.values()).map((job) => ({
			id: job.id,
			token: job.token,
			enquiryId: job.enquiryId,
			status: job.status,
			attempt: job.attempt,
			running: job.running,
			createdAt: job.createdAt,
			lastRunAt: job.lastRunAt,
			lastCallbackAt: job.lastCallbackAt,
			lastError: job.lastError,
			bydaStatus: job.bydaStatus || "",
			hasShareUrl: !!job.shareUrl,
			hasFileUrl: !!job.fileUrl,
			hasStorageKey: !!job.storageKey,
			fileUrlExpiresAt: job.fileUrlExpiresAt || null,
			pendingCallback: !!job.pendingSnapshot,
		}));

		return jsonResponse(res, 200, {
			ok: true,
			count: snapshot.length,
			jobs: snapshot,
		});
	}

	if (method === "GET" && pathname === "/options") {
		const secret = getSecret(req);
		if (!isAuthorized(secret)) {
			return jsonResponse(res, 401, { error: "Unauthorized" });
		}

		try {
			return jsonResponse(res, 200, await bydaGetOptionsPayload());
		} catch (error) {
			log("Options proxy error.", errorLogMeta(error));
			return jsonError(res, errorStatus(error), error);
		}
	}

	if (method === "GET" && pathname === "/enquiries/search") {
		const secret = getSecret(req);
		if (!isAuthorized(secret)) {
			return jsonResponse(res, 401, { error: "Unauthorized" });
		}

		try {
			const limit = Number(requestUrl.searchParams.get("limit") || 20);
			const offset = Number(requestUrl.searchParams.get("offset") || 0);
			const createdAfter = requestUrl.searchParams.get("createdAfter") || "";
			const result = await bydaSearchEnquiries({
				limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20,
				offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
				createdAfter,
			});

			return jsonResponse(res, 200, result);
		} catch (error) {
			log("Enquiry search proxy error.", errorLogMeta(error));
			return jsonError(res, errorStatus(error), error);
		}
	}

	const enquiryStatusMatch = /^\/enquiries\/([^/]+)$/.exec(pathname);
	if (method === "GET" && enquiryStatusMatch) {
		const secret = getSecret(req);
		if (!isAuthorized(secret)) {
			return jsonResponse(res, 401, { error: "Unauthorized" });
		}

		try {
			const enquiryId = decodeURIComponent(enquiryStatusMatch[1]);
			const status = await bydaGetStatusSnapshot(enquiryId);
			return jsonResponse(res, 200, status);
		} catch (error) {
			log("Enquiry status proxy error.", errorLogMeta(error));
			return jsonError(res, errorStatus(error), error);
		}
	}

	const enquiryReportMatch = /^\/enquiries\/([^/]+)\/report$/.exec(pathname);
	if (method === "GET" && enquiryReportMatch) {
		const secret = getSecret(req);
		if (!isAuthorized(secret)) {
			return jsonResponse(res, 401, { error: "Unauthorized" });
		}

		try {
			const enquiryId = decodeURIComponent(enquiryReportMatch[1]);
			const status = await bydaGetStatusSnapshot(enquiryId);
			return jsonResponse(res, 200, {
				enquiryId: status.enquiryId,
				reportUrl: status.fileUrl || status.shareUrl || null,
				fileUrl: status.fileUrl || null,
				sourceFileUrl: status.sourceFileUrl || null,
				storageKey: status.storageKey || null,
				fileUrlExpiresAt: status.fileUrlExpiresAt || null,
				shareUrl: status.shareUrl || null,
				combinedFileId: status.combinedFileId || null,
				combinedJobId: status.combinedJobId || null,
				bydaStatus: status.bydaStatus || null,
				status: status.status,
			});
		} catch (error) {
			log("Enquiry report proxy error.", errorLogMeta(error));
			return jsonError(res, errorStatus(error), error);
		}
	}

	if (method === "POST" && pathname === "/organisations/search") {
		try {
			const body = await readJson(req);
			const secret = getSecret(req, body);
			if (!isAuthorized(secret)) {
				return jsonResponse(res, 401, { error: "Unauthorized" });
			}

			const polygon = body && body.resolvedSite && body.resolvedSite.polygon
				? body.resolvedSite.polygon
				: body && body.polygon
					? body.polygon
					: null;
			if (!polygon) {
				return jsonResponse(res, 400, { error: "polygon or resolvedSite.polygon is required." });
			}

			const organisations = await bydaGetOrganisations(polygon);
			return jsonResponse(res, 200, { organisations });
		} catch (error) {
			log("Organisation proxy error.", errorLogMeta(error, { pathname }));
			return jsonError(res, errorStatus(error), error);
		}
	}

	if (method === "POST" && pathname === "/enquiries") {
		try {
			const body = await readJson(req);
			const secret = getSecret(req, body);
			if (!isAuthorized(secret)) {
				log("Enquiry create request unauthorized.", {
					requestId,
					hasSecret: Boolean(secret),
					secretLength: String(secret || "").length,
				});
				return jsonResponse(res, 401, { error: "Unauthorized" });
			}

			const token = String(body && body.token ? body.token : "").trim();
			const callbackUrl = String(body && body.callbackUrl ? body.callbackUrl : config.defaultCallbackUrl).trim();
			const payload = body && body.payload && typeof body.payload === "object" ? body.payload : null;
			log("Enquiry create request body parsed.", {
				requestId,
				token,
				callbackUrl: urlSummary(callbackUrl),
				hasPayload: Boolean(payload),
				payloadSummary: payload ? {
					userReference: payload.userReference || null,
					digStartAt: payload.digStartAt || null,
					digEndAt: payload.digEndAt || null,
					isPlanningJob: Boolean(payload.isPlanningJob),
					activityTypes: payload.activityTypes || [],
					locationTypes: payload.locationTypes || [],
					authorityId: payload.authorityId || null,
					otherAuthorityName: payload.otherAuthorityName || null,
					hasShape: Boolean(payload.shape),
					address: payload.Address || null,
				} : null,
			});
			if (!token) {
				return jsonResponse(res, 400, { error: "token is required." });
			}
			if (!callbackUrl) {
				return jsonResponse(res, 400, { error: "callbackUrl is required." });
			}
			if (!payload) {
				return jsonResponse(res, 400, { error: "payload is required." });
			}

			const started = startCreateJob({ token, callbackUrl, payload });
			log("Enquiry create request accepted.", {
				requestId,
				token,
				status: "creating",
				jobs: started.jobIds,
			});
			return jsonResponse(res, 202, {
				success: true,
				status: "creating",
				enquiryId: null,
				externalId: null,
				bydaStatus: "CREATING",
				jobs: started.jobIds,
				jobDetails: started.jobDetails,
			});
		} catch (error) {
			log("Enquiry proxy error.", errorLogMeta(error));
			return jsonError(res, errorStatus(error), error);
		}
	}

	if (method === "POST" && pathname === "/start") {
		try {
			const body = await readJson(req);
			const secret = getSecret(req, body);
			if (!isAuthorized(secret)) {
				return jsonResponse(res, 401, { error: "Unauthorized" });
			}

			const started = startJob(body);
			return jsonResponse(res, 200, {
				success: true,
				jobs: started.jobIds,
				jobDetails: started.jobDetails,
			});
		} catch (error) {
			log("Start request error.", {
				error: extractResponseError(error),
			});
			return jsonResponse(res, 500, { error: extractResponseError(error) });
		}
	}

	if (method === "POST" && pathname === "/cancel") {
		try {
			const body = await readJson(req);
			const secret = getSecret(req, body);
			if (!isAuthorized(secret)) {
				return jsonResponse(res, 401, { error: "Unauthorized" });
			}

			const token = String(body && body.token ? body.token : "").trim();
			const cancelled = cancelJobs(token);
			log("Jobs cancelled.", {
				token: token || null,
				cancelled,
			});
			return jsonResponse(res, 200, {
				success: true,
				cancelled,
			});
		} catch (error) {
			log("Cancel request error.", {
				error: extractResponseError(error),
			});
			return jsonResponse(res, 500, { error: extractResponseError(error) });
		}
	}

	return jsonResponse(res, 404, { error: "Not found" });
});

server.listen(config.port, () => {
	log("BYDA IET poller started.", {
		port: config.port,
		bydaEnvironment: config.bydaEnvironment,
		bydaBaseUrl: config.bydaBaseUrl,
		hasClientId: !!config.bydaClientId,
		hasClientSecret: !!config.bydaClientSecret,
		asyncCreate: true,
	});
});
