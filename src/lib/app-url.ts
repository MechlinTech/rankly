import type { NextRequest } from "next/server";

/**
 * Canonical public base URL of the app (e.g. "https://rankly.mechlintech.com").
 *
 * Set APP_URL in production. Relying on req.nextUrl.origin breaks when the
 * app sits behind a reverse proxy / Docker port mapping — the request URL
 * becomes the internal bind address (e.g. https://0.0.0.0:3000), which then
 * leaks into verification emails, password-reset links, OAuth redirect URIs
 * and Stripe return URLs.
 */
export function getAppUrl(req?: NextRequest): string {
  const fromEnv = process.env.APP_URL;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, "");
  }
  if (req) {
    return req.nextUrl.origin;
  }
  throw new Error("APP_URL is not set and no request context is available.");
}
