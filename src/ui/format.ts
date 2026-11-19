const MONEY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function padTwo(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  return digits === 0
    ? MONEY.format(Math.round(value))
    : DECIMAL.format(Number(value.toFixed(digits)));
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `$${MONEY.format(Math.round(value))}`;
}

export function formatSignedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  const rounded = Math.round(value);
  const sign = rounded >= 0 ? '+' : '-';
  return `${sign}$${MONEY.format(Math.abs(rounded))}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return 'n/a';
  }
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours > 0 && rest > 0) {
    return `${hours}h ${rest}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${rest}m`;
}

export function formatRelative(timestamp: number | null | undefined, now: number): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return 'never';
  }
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 0) {
    return `in ${formatMinutes(-seconds / 60)}`;
  }
  if (seconds < 45) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return 'n/a';
  }
  return new Date(timestamp).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatTctTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return 'n/a';
  }
  const date = new Date(timestamp);
  return `${padTwo(date.getUTCHours())}:${padTwo(date.getUTCMinutes())} TCT`;
}

export function formatTctDateTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return 'n/a';
  }
  const date = new Date(timestamp);
  const month = MONTHS[date.getUTCMonth()] ?? '';
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}, ${formatTctTime(timestamp)}`;
}

export function formatStock(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  return MONEY.format(Math.max(0, Math.floor(value)));
}
