// Presigned URLs (AWS Signature V4, query-string form) for Cloudflare R2's S3-compatible API.
// Lets the admin's browser PUT large photos straight into R2, so the bytes never pass through the
// Worker (Workers Free allows ~10 ms of CPU per request; streaming 25–30 MB through it costs
// 100–250 ms and gets the invocation terminated with error 1102).
//
// Each URL authorizes ONE method on ONE key, for a few minutes. content-length and content-type are
// signed: R2 rejects a body of any other size or type, so the storage budget cannot be bypassed.
// The credentials (an R2 API token restricted to the photo buckets) stay in Worker secrets.

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(key: ArrayBuffer | Uint8Array<ArrayBuffer>, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

// RFC 3986 encoding as SigV4 requires ("/" kept in paths, encoded in query values).
const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type PresignInput = {
  method: "PUT" | "GET" | "DELETE";
  host: string; // e.g. <account>.r2.cloudflarestorage.com
  path: string; // "/<bucket>/<key>"
  accessKeyId: string;
  secretAccessKey: string;
  region?: string; // R2: "auto"
  service?: string; // "s3"
  expiresSeconds: number;
  signedHeaders?: Record<string, string>; // lowercase names, e.g. content-length, content-type
  query?: Record<string, string>; // extra signed query parameters (e.g. list-type=2)
  now?: Date;
};

export async function presignUrl(input: PresignInput): Promise<string> {
  const region = input.region ?? "auto";
  const service = input.service ?? "s3";
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;

  const headers: Record<string, string> = { host: input.host };
  for (const [name, value] of Object.entries(input.signedHeaders ?? {})) headers[name.toLowerCase()] = String(value).trim();
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(";");

  const query: Record<string, string> = {
    ...(input.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
    .join("&");
  const canonicalPath = input.path.split("/").map(encodeRfc3986).join("/");
  const canonicalHeaders = headerNames.map((name) => `${name}:${headers[name]}\n`).join("");

  const canonicalRequest = [input.method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  let key: ArrayBuffer = await hmac(encoder.encode(`AWS4${input.secretAccessKey}`), date);
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, "aws4_request");
  const signature = toHex(await hmac(key, stringToSign));

  return `https://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// R2 configuration for direct uploads. null → not configured: uploads go through the Worker
// (local development / tests).
export type R2DirectConfig = { accountId: string; accessKeyId: string; secretAccessKey: string };

export function getR2DirectConfig(): R2DirectConfig | null {
  const accountId = (process.env.R2_ACCOUNT_ID ?? "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
  if (!/^[0-9a-f]{32}$/.test(accountId) || !accessKeyId || !secretAccessKey) return null;
  return { accountId, accessKeyId, secretAccessKey };
}

export const DIRECT_UPLOAD_TTL_SECONDS = 15 * 60;

// Headers the browser must send with a presigned PUT (they are part of the signature).
// If-None-Match: * → R2 only writes if the key does not exist yet: a presigned URL can never
// overwrite a stored file (not even its own after a successful upload); a retry gets 412.
export const directUploadHeaders = (contentType: string) => ({ "Content-Type": contentType, "If-None-Match": "*" });

export async function presignR2Put(
  config: R2DirectConfig,
  bucket: string,
  key: string,
  contentType: string,
  contentLength: number,
  expiresSeconds = DIRECT_UPLOAD_TTL_SECONDS,
) {
  return presignUrl({
    method: "PUT",
    host: `${config.accountId}.r2.cloudflarestorage.com`,
    path: `/${bucket}/${key}`,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresSeconds,
    signedHeaders: { "content-length": String(contentLength), "content-type": contentType, "if-none-match": "*" },
  });
}
