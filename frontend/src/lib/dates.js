// The API returns naive UTC timestamps such as "2026-10-20T10:15:00.123456"
// (no timezone), so a timestamp without a zone is read as UTC.
export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).replace(/(\.\d{3})\d+/, '$1');
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  const date = new Date(hasZone ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

// "just now", "5 minutes ago", "yesterday", "in 6 days"; older than a week
// falls back to a short date
export function formatRelative(value, now = new Date()) {
  const date = parseServerDate(value);
  if (!date) return '';
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 45 * 1000) return diff < 0 ? 'just now' : 'in a moment';
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return relative.format(Math.round(diff / DAY), 'day');
  return formatDate(date, now);
}

// "Oct 20" in the current year, "Oct 20, 2025" otherwise
export function formatDate(value, now = new Date()) {
  const date = parseServerDate(value);
  if (!date) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatLongDate(value) {
  const date = parseServerDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
