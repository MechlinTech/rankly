import type { NextConfig } from "next";

// Baseline security headers, applied to every route. This is not a substitute
// for a reviewed, app-specific Content-Security-Policy (a strict CSP needs to
// account for every third-party script/style the app actually loads — Stripe
// Checkout redirects, Google/Microsoft OAuth redirects, etc. — and hasn't been
// tuned here yet), but it closes the easy, always-safe gaps. See SECURITY.md.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Standalone output for a minimal Docker runtime image — see docker/Dockerfile.
  output: "standalone",

  // The dev-mode route indicator defaults to bottom-left, which sits directly
  // on top of the dashboard sidebar's "Log out" button - it physically
  // intercepted real mouse clicks there (confirmed via manual reproduction:
  // a coordinate-based click did nothing, while a programmatic .click() on
  // the same element worked correctly). Compile/runtime errors still surface
  // without it, per Next's own docs - this only removes the cosmetic overlay.
  devIndicators: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
