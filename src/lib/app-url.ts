export interface AppUrlRequest {
  headers: { get(name: string): string | null };
  nextUrl: { protocol: string; host: string; origin: string };
}

const INTERNAL_HOST_SUFFIXES = [".localhost", ".local", ".internal"];
const TWO_LEVEL_PUBLIC_SUFFIXES = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function parseHost(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(`http://${value}`);
    return url.hostname ? url : null;
  } catch {
    return null;
  }
}

function isInternalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "postgres" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    !host.includes(".") ||
    INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/**
 * Returns the public host the browser actually used, when one is available.
 * Reverse proxies set x-forwarded-host; direct deployments fall back to Host.
 * Internal addresses (Docker service names, localhost, private IPs) are ignored
 * so they can never leak into emails or OAuth/Stripe redirects.
 */
function requestHost(req: AppUrlRequest): URL | null {
  const forwarded = parseHost(firstHeaderValue(req.headers.get("x-forwarded-host")));
  const direct = parseHost(firstHeaderValue(req.headers.get("host")));
  const nextHost = parseHost(req.nextUrl.host);

  for (const candidate of [forwarded, direct, nextHost]) {
    if (candidate && !isInternalHostname(candidate.hostname)) return candidate;
  }
  return null;
}

function requestOrigin(req: AppUrlRequest): string | null {
  const host = requestHost(req);
  if (!host) return null;

  const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto"))?.toLowerCase();
  const protocol =
    forwardedProto === "https" || forwardedProto === "http"
      ? `${forwardedProto}:`
      : req.nextUrl.protocol === "https:"
        ? "https:"
        : "http:";

  try {
    return new URL(`${protocol}//${host.host}`).origin;
  } catch {
    return null;
  }
}

/**
 * The registrable-ish domain used for the "same site" check. This is not a full
 * public-suffix implementation, but it treats common multi-part suffixes such
 * as co.uk correctly so unrelated sites are never considered siblings.
 */
function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  if (labels.at(-2)!.length <= 3 && TWO_LEVEL_PUBLIC_SUFFIXES.has(labels.at(-2)!)) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

/**
 * Canonical public base URL of the app (e.g. "https://rankly.mechlintech.com").
 *
 * APP_URL is still the source of truth for background jobs and for deployments
 * where the request only contains an internal bind address. But when the
 * request arrives on a different host under the same site (for example, a stale
 * APP_URL left over from an old dev hostname), the host the user is actually
 * browsing wins so verification and reset links stay reachable.
 */
export function getAppUrl(req?: AppUrlRequest): string {
  const configured = process.env.APP_URL?.trim();

  if (!configured) {
    if (req) return requestOrigin(req) ?? req.nextUrl.origin;
    throw new Error("APP_URL is not set and no request context is available.");
  }

  const canonical = configured.replace(/\/+$/, "");
  if (!req) return canonical;

  let appUrl: URL;
  try {
    appUrl = new URL(canonical);
  } catch {
    return canonical;
  }

  const origin = requestOrigin(req);
  if (!origin) return canonical;

  const requestUrl = new URL(origin);
  if (appUrl.hostname.toLowerCase() === requestUrl.hostname.toLowerCase()) {
    return canonical;
  }

  if (registrableDomain(appUrl.hostname) === registrableDomain(requestUrl.hostname)) {
    // Preserve the configured scheme (normally https) even if the proxy only
    // forwards an http request internally.
    const protocol = appUrl.protocol === "https:" ? "https:" : requestUrl.protocol;
    return new URL(`${protocol}//${requestUrl.host}`).origin;
  }

  return canonical;
}
