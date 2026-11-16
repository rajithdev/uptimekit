/**
 * Expected HTTP status specification, e.g. "200-299", "200,204", "200-299,301-302".
 */
export type StatusRange = readonly [number, number];

const TOKEN = /^(\d{3})(?:-(\d{3}))?$/;

export function parseExpectedStatusCodes(spec: string): StatusRange[] {
  const parts = spec
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 20) {
    throw new Error("Specify between 1 and 20 status codes or ranges");
  }
  return parts.map((part) => {
    const m = TOKEN.exec(part);
    if (!m) throw new Error(`Invalid status code or range: "${part}"`);
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    if (lo < 100 || hi > 599 || lo > hi) {
      throw new Error(`Status range out of bounds: "${part}"`);
    }
    return [lo, hi] as const;
  });
}

export function isValidStatusSpec(spec: string): boolean {
  try {
    parseExpectedStatusCodes(spec);
    return true;
  } catch {
    return false;
  }
}

export function isExpectedStatus(code: number, spec: string | StatusRange[]): boolean {
  const ranges = typeof spec === "string" ? parseExpectedStatusCodes(spec) : spec;
  return ranges.some(([lo, hi]) => code >= lo && code <= hi);
}
