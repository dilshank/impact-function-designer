// Lenient parsing and formatting for the text fields, which keep what the user typed.

export function num(s: unknown): number {
  if (s === null || s === undefined) return NaN;
  const t = String(s).replace(/[^0-9eE+\-.]/g, '');
  if (t === '' || t === '-' || t === '.' || t === '+') return NaN;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

export function blank(s: unknown): boolean {
  return String(s ?? '').trim() === '';
}

export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export function plain(v: number): string {
  return Number.isFinite(v) ? String(round6(v)) : '';
}

/** Fixed decimals with trailing zeros trimmed; an em dash for non-finite values. */
export function fmt(v: number, d = 3): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(d);
  const t = s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return t === '-0' ? '0' : t;
}

/** A 1, 2, 2.5 or 5 × 10^n step giving about six intervals over the range. */
export function niceStep(range: number): number {
  const raw = range / 6;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** One step up (dir 1) or down (dir -1) from a typed value; blank or unparseable counts as 0. */
export function stepNumber(raw: unknown, dir: 1 | -1, step: number): number {
  const cur = num(raw);
  return round6((Number.isFinite(cur) ? cur : 0) + dir * step);
}
