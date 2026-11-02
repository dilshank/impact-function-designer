import type { Interpolation, Kind, OriginAdjustment, OutsideDomain } from './evaluate';
import { fmt } from './numbers';

export type HazardId = 'flood' | 'wind' | 'rx1day' | 'mcdd' | 'hot' | 'frost' | 'cdd' | 'tnn' | 'custom';
export type ImpactId = 'damage_ratio' | 'damage_percent' | 'loss' | 'downtime' | 'crop_yield_change' | 'score' | 'custom';

/** Starter models are authored compactly; points are [x, y] pairs. */
export type StarterModel =
  | { kind: 'tabulated'; points: [number, number][]; interpolation: Interpolation; outside_domain: OutsideDomain }
  | { kind: 'binned'; bin_edges: number[]; values: number[]; outside_domain: OutsideDomain }
  | { kind: 'sigmoid'; midpoint: number; steepness: number; offset: number; amplitude: number; origin_adjustment: OriginAdjustment; zero_below: number | null }
  | { kind: 'linear'; slope: number; intercept: number };

export interface HazardPreset {
  label: string;
  variable: string;
  unit: string;
  domain: [number, number];
  starter: StarterModel & { kind: Kind };
  clamp: [number, number] | null;
}

export const HAZARDS: Record<HazardId, HazardPreset> = {
  flood: {
    label: 'Riverine flood depth', variable: 'flood_depth', unit: 'm', domain: [0, 5],
    starter: { kind: 'tabulated', points: [[0, 0], [0.3, 0.08], [1, 0.45], [2, 1]], interpolation: 'linear', outside_domain: 'clamp' },
    clamp: [0, 1],
  },
  wind: {
    label: 'Wind speed', variable: 'wind_speed', unit: 'm/s', domain: [0, 90],
    starter: { kind: 'sigmoid', midpoint: 55, steepness: 0.15, offset: 0, amplitude: 1, origin_adjustment: 'none', zero_below: 25 },
    clamp: null,
  },
  rx1day: {
    label: 'Max 1-day precipitation', variable: 'rx1day', unit: 'mm', domain: [0, 300],
    starter: { kind: 'tabulated', points: [[0, 0], [50, 0], [100, 0.03], [200, 0.12], [300, 0.25]], interpolation: 'linear', outside_domain: 'clamp' },
    clamp: [0, 1],
  },
  mcdd: {
    label: 'Max consecutive dry days', variable: 'maximum_consecutive_dry_days', unit: 'd', domain: [0, 120],
    starter: { kind: 'linear', slope: 0.008, intercept: -0.12 },
    clamp: [0, 0.6],
  },
  hot: {
    label: 'Hot days', variable: 'hot_days', unit: 'd', domain: [0, 200],
    starter: { kind: 'linear', slope: 0.002, intercept: 0 },
    clamp: [0, 0.4],
  },
  frost: {
    label: 'Frost days', variable: 'frost_days', unit: 'd', domain: [0, 250],
    starter: { kind: 'binned', bin_edges: [0, 50, 100, 150, 250], values: [0, 0.02, 0.06, 0.12], outside_domain: 'clamp' },
    clamp: null,
  },
  cdd: {
    label: 'Cooling degree days', variable: 'cooling_degree_days', unit: 'K.d', domain: [0, 3000],
    starter: { kind: 'linear', slope: 0.0001, intercept: 0 },
    clamp: [0, 0.3],
  },
  tnn: {
    label: 'Annual minimum temperature', variable: 'tnn', unit: 'degC', domain: [-45, 10],
    starter: { kind: 'tabulated', points: [[-40, 0.3], [-25, 0.15], [-10, 0.02], [0, 0]], interpolation: 'linear', outside_domain: 'clamp' },
    clamp: [0, 1],
  },
  custom: {
    label: 'Custom exposure', variable: 'value', unit: '1', domain: [0, 10],
    starter: { kind: 'tabulated', points: [[0, 0], [5, 0.5], [10, 1]], interpolation: 'linear', outside_domain: 'clamp' },
    clamp: null,
  },
};

export interface ImpactPreset {
  label: string;
  metric: string;
  unit: string;
  decimals: number;
  step: number;
  currency?: boolean;
  hint: string;
}

export const IMPACTS: Record<ImpactId, ImpactPreset> = {
  damage_ratio: { label: 'Damage ratio, 0 to 1', metric: 'damage_ratio', unit: '1', decimals: 2, step: 0.01, hint: 'Unit "1" is dimensionless (aliases: fraction, ratio). Set a 0 to 1 clamp below to bound it.' },
  damage_percent: { label: 'Damage percentage', metric: 'damage_percent', unit: '%', decimals: 1, step: 0.1, hint: 'Unit "%", percentage points from 0 to 100.' },
  loss: { label: 'Monetary loss', metric: 'loss', unit: 'USD', decimals: 2, step: 1000, currency: true, hint: 'A currency such as USD, or per floor area such as EUR/m2.' },
  downtime: { label: 'Downtime in days', metric: 'downtime', unit: 'd', decimals: 1, step: 0.5, hint: 'Unit "d" (aliases: day, days).' },
  crop_yield_change: { label: 'Crop yield change', metric: 'crop_yield_change', unit: '1', decimals: 3, step: 0.01, hint: 'Dimensionless change; negative values are losses.' },
  score: { label: 'Score, no unit', metric: 'score', unit: '1', decimals: 2, step: 0.1, hint: 'Dimensionless score.' },
  custom: { label: 'Custom response', metric: 'response', unit: '1', decimals: 3, step: 0.01, hint: 'Any standard unit; no physical conversion is implied.' },
};

export function hazard(id: string): HazardPreset {
  return HAZARDS[id as HazardId] ?? HAZARDS.custom;
}

export function impact(id: string): ImpactPreset {
  return IMPACTS[id as ImpactId] ?? IMPACTS.custom;
}

/** How impact values are shown: the preset's precision plus a unit prefix/suffix. */
export interface ImpactFormat extends ImpactPreset {
  prefix: string;
  suffix: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', CAD: 'C$', AUD: 'A$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF ' };

export function impactFmt(cal: { impactPreset: string; impact_unit: string }): ImpactFormat {
  const base = impact(cal.impactPreset);
  const unit = String(cal.impact_unit || '');
  let prefix = '';
  let suffix = '';
  if (base.currency) {
    const m = unit.match(/^([A-Z]{3})(.*)$/);
    prefix = m ? CURRENCY_SYMBOLS[m[1]] || m[1] + ' ' : '';
    suffix = m ? m[2] : unit;
  } else if (unit === '%') suffix = '%';
  else if (unit === 'd') suffix = 'days';
  else if (unit !== '1') suffix = unit;
  if (cal.impactPreset === 'score') suffix = 'pts';
  return { ...base, prefix, suffix };
}

/** Value for an impact input field. */
export function fmtImpactNum(v: number, u: Pick<ImpactPreset, 'decimals' | 'currency'>): string {
  if (!Number.isFinite(v)) return '';
  if (u.currency) return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return v.toFixed(u.decimals);
}

/** Compact label for axis ticks and readouts. */
export function impactTick(v: number, u: ImpactFormat): string {
  if (!Number.isFinite(v)) return '—';
  if (u.currency) {
    const a = Math.abs(v);
    const body = a >= 1e9 ? fmt(v / 1e9, 2) + 'B' : a >= 1e6 ? fmt(v / 1e6, 2) + 'M' : a >= 1e3 ? fmt(v / 1e3, 1) + 'k' : fmt(v, 2);
    return (u.prefix || '') + body + (u.suffix || '');
  }
  if (u.unit === '%' || u.suffix === '%') return fmt(v, 1) + '%';
  if (u.suffix === 'days') return fmt(v, 1) + ' d';
  return fmt(v, 3);
}
