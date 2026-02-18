// Helper functions to normalize and format billing period values.
// Normalized format: YYYY-MM (e.g. 2026-01)

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function normalizeBillingPeriod(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Accept YYYY-MM or YYYY/MM or YYYY MM
  const ymdMatch = s.match(/^(\d{4})[\-\/]?(\d{1,2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    if (year >= 1900 && month >= 1 && month <= 12) return `${year}-${pad(month)}`;
  }

  // Accept MM/YYYY or MM-YYYY or MM/YYYY
  const myMatch = s.match(/^(\d{1,2})[\-\/]?(\d{4})$/);
  if (myMatch) {
    const month = Number(myMatch[1]);
    const year = Number(myMatch[2]);
    if (year >= 1900 && month >= 1 && month <= 12) return `${year}-${pad(month)}`;
  }

  // Accept 'Jan 2026' or 'January 2026' (month name then year)
  const parts = s.split(/[\s\/\-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const [p0, p1] = parts;
    let monthNum = MONTHS[p0.toLowerCase()];
    let yearNum = Number(p1);
    if (!monthNum) {
      // maybe reversed order: year first then month name
      monthNum = MONTHS[p1.toLowerCase()];
      yearNum = Number(p0);
    }
    if (monthNum && yearNum && yearNum >= 1900) return `${yearNum}-${pad(monthNum)}`;
  }

  // Accept full date like 2026-01-15 or 01/15/2026
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    return `${year}-${pad(month)}`;
  }

  // Unable to parse
  throw new Error('Invalid billing period format');
}

export function formatBillingPeriodDisplay(normalized: string | null | undefined): string | null {
  if (!normalized) return null;
  const m = String(normalized).match(/^(\d{4})-(\d{2})$/);
  if (!m) return normalized;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const name = MONTH_NAMES[month - 1] || String(month);
  return `${name} ${year}`;
}
