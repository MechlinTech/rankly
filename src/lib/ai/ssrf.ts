import { SsrfBlockedError } from "./errors";

// Private IPv4 CIDR blocks
const PRIVATE_IPV4_RANGES: Array<{ start: number; end: number }> = [
  // 0.0.0.0/8 (Current network)
  { start: ipToNumber("0.0.0.0"), end: ipToNumber("0.255.255.255") },
  // 10.0.0.0/8 (Private)
  { start: ipToNumber("10.0.0.0"), end: ipToNumber("10.255.255.255") },
  // 100.64.0.0/10 (Carrier-grade NAT)
  { start: ipToNumber("100.64.0.0"), end: ipToNumber("100.127.255.255") },
  // 127.0.0.0/8 (Loopback)
  { start: ipToNumber("127.0.0.0"), end: ipToNumber("127.255.255.255") },
  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Metadata 169.254.169.254)
  { start: ipToNumber("169.254.0.0"), end: ipToNumber("169.254.255.255") },
  // 172.16.0.0/12 (Private)
  { start: ipToNumber("172.16.0.0"), end: ipToNumber("172.31.255.255") },
  // 192.0.0.0/24 (IETF Protocol Assignments)
  { start: ipToNumber("192.0.0.0"), end: ipToNumber("192.0.0.255") },
  // 192.168.0.0/16 (Private)
  { start: ipToNumber("192.168.0.0"), end: ipToNumber("192.168.255.255") },
  // 198.18.0.0/15 (Benchmarking)
  { start: ipToNumber("198.18.0.0"), end: ipToNumber("198.19.255.255") },
  // 224.0.0.0/4 (Multicast)
  { start: ipToNumber("224.0.0.0"), end: ipToNumber("239.255.255.255") },
  // 240.0.0.0/4 (Reserved / Future Use)
  { start: ipToNumber("240.0.0.0"), end: ipToNumber("255.255.255.255") },
];

function ipToNumber(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0) >>>
    0
  );
}

/**
 * Checks if an IPv4 address is in a private, loopback, or metadata range.
 */
export function isPrivateIpv4(ip: string): boolean {
  // Check decimal representation
  const parts = ip.split(".");
  if (parts.length !== 4) return true; // Malformed -> consider unsafe

  for (const part of parts) {
    if (!/^\d+$/.test(part)) return true;
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) return true;
  }

  const num = ipToNumber(ip);
  return PRIVATE_IPV4_RANGES.some((range) => num >= range.start && num <= range.end);
}

/**
 * Checks if a hostname or IPv6 address represents a local or restricted address.
 */
export function isRestrictedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();

  // Strip brackets if IPv6
  const cleanHost = lower.startsWith("[") && lower.endsWith("]")
    ? lower.slice(1, -1)
    : lower;

  // Localhost names
  if (
    cleanHost === "localhost" ||
    cleanHost.endsWith(".localhost") ||
    cleanHost === "localhost.localdomain" ||
    cleanHost === "ip6-localhost" ||
    cleanHost === "ip6-loopback"
  ) {
    return true;
  }

  // Cloud metadata domain names
  if (
    cleanHost === "metadata.google.internal" ||
    cleanHost.endsWith(".internal") ||
    cleanHost === "instance-data"
  ) {
    return true;
  }

  // IPv6 loopback / unique local / link local
  if (
    cleanHost === "::1" ||
    cleanHost === "::" ||
    cleanHost.startsWith("fe80:") || // Link-local
    cleanHost.startsWith("fc00:") || // Unique local
    cleanHost.startsWith("fd00:") ||
    cleanHost.startsWith("::ffff:")  // IPv4 mapped
  ) {
    return true;
  }

  // Check IPv4 format
  // Reject alternative numeric representations of IP addresses (hex, octal, single dword integer)
  // e.g. 0x7f000001, 2130706433, or 0177.0.0.1
  if (/^0x[0-9a-f]+$/i.test(cleanHost) || /^\d+$/.test(cleanHost)) {
    return true;
  }

  if (/^(\d+|0x[0-9a-f]+)(\.(\d+|0x[0-9a-f]+)){1,3}$/i.test(cleanHost)) {
    const parts = cleanHost.split(".");
    // If not standard 4-part IPv4, or any part has leading zero / hex prefix, block as evasion
    if (parts.length !== 4 || parts.some((p) => (p.length > 1 && p.startsWith("0")) || /^0x/i.test(p))) {
      return true;
    }
    return isPrivateIpv4(cleanHost);
  }

  return false;
}

/**
 * Strict validator for custom AI provider endpoints to prevent Server-Side Request Forgery (SSRF).
 * Throws SsrfBlockedError if destination is disallowed.
 */
export function validateCustomEndpointUrl(rawUrl: string): URL {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new SsrfBlockedError("Custom endpoint URL is required.");
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SsrfBlockedError("Custom endpoint is not a valid URL.");
  }

  // Reject credentials in URL (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("Custom endpoint URL must not contain embedded user credentials.");
  }

  const isProduction = process.env.NODE_ENV === "production";

  // Scheme restrictions
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SsrfBlockedError(`Unsupported protocol "${parsed.protocol}". Only HTTP/HTTPS is permitted.`);
  }

  // In production, require HTTPS unless loopback is explicitly tested
  if (isProduction && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("HTTPS is required for custom AI provider endpoints in production.");
  }

  const host = parsed.hostname;

  // In production, block all loopback, private IP, and metadata destinations
  if (isProduction) {
    if (isRestrictedHost(host)) {
      throw new SsrfBlockedError(
        `Destination host "${host}" is restricted (private network, loopback, or cloud metadata access prohibited).`
      );
    }
  } else {
    // In local development / test, allow localhost loopback (Ollama, LM Studio, etc.),
    // but still block cloud metadata (169.254.169.254)
    if (host === "169.254.169.254" || host === "metadata.google.internal") {
      throw new SsrfBlockedError("Access to cloud instance metadata service is prohibited.");
    }
  }

  return parsed;
}
