const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+$/;

export function validateAuditDomain(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 255 || !DOMAIN_REGEX.test(trimmed)) {
    return "Enter a valid domain.";
  }
  return null;
}
