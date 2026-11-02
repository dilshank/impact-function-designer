// The standard unit tokens a definition may declare. Calibration never converts between them.
import type { ImpactId } from './presets';

export interface UnitOption {
  token: string;
  label: string;
  group: string;
}

export const EXPOSURE_UNITS: UnitOption[] = [
  { token: 'm', label: 'metres', group: 'Length and depth' },
  { token: 'cm', label: 'centimetres', group: 'Length and depth' },
  { token: 'mm', label: 'millimetres (depth or precipitation)', group: 'Length and depth' },
  { token: 'mm/h', label: 'millimetres per hour', group: 'Rate' },
  { token: 'mm/d', label: 'millimetres per day', group: 'Rate' },
  { token: 'm/s', label: 'metres per second', group: 'Speed' },
  { token: 'km/h', label: 'kilometres per hour', group: 'Speed' },
  { token: 'kn', label: 'knots', group: 'Speed' },
  { token: 'degC', label: 'degrees Celsius', group: 'Temperature' },
  { token: 'K', label: 'kelvin', group: 'Temperature' },
  { token: 'K.d', label: 'degree days', group: 'Temperature' },
  { token: 'd', label: 'days', group: 'Duration and counts' },
  { token: 'h', label: 'hours', group: 'Duration and counts' },
  { token: '1', label: 'dimensionless (index, ratio, count)', group: 'Dimensionless' },
  { token: '%', label: 'percent', group: 'Dimensionless' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF'];
const CURRENCY_UNITS: UnitOption[] = CURRENCIES.map((c) => ({ token: c, label: c, group: 'Currency' }));
const CURRENCY_AREA_UNITS: UnitOption[] = CURRENCIES.map((c) => ({ token: c + '/m2', label: c + ' per square metre', group: 'Currency per area' }));

export const IMPACT_UNITS: UnitOption[] = [
  { token: '1', label: 'dimensionless (ratio, fraction, score)', group: 'Dimensionless' },
  { token: '%', label: 'percent', group: 'Dimensionless' },
  ...CURRENCY_UNITS,
  ...CURRENCY_AREA_UNITS,
  { token: 'd', label: 'days', group: 'Duration' },
  { token: 'h', label: 'hours', group: 'Duration' },
];

const byToken = (tokens: string[]) => IMPACT_UNITS.filter((u) => tokens.includes(u.token));

/** Impact units that make sense for an impact preset; the preset decides how values are formatted. */
export function impactUnitsFor(preset: ImpactId): UnitOption[] {
  switch (preset) {
    case 'damage_ratio':
    case 'score':
      return byToken(['1']);
    case 'damage_percent':
      return byToken(['%']);
    case 'loss':
      return [...CURRENCY_UNITS, ...CURRENCY_AREA_UNITS];
    case 'downtime':
      return byToken(['d', 'h']);
    case 'crop_yield_change':
      return byToken(['1', '%']);
    case 'custom':
      return IMPACT_UNITS;
  }
}

export const isExposureUnit = (t: string) => EXPOSURE_UNITS.some((u) => u.token === t);
export const isImpactUnit = (t: string) => IMPACT_UNITS.some((u) => u.token === t);
export const isCurrencyUnit = (t: string) => CURRENCY_UNITS.some((u) => u.token === t) || CURRENCY_AREA_UNITS.some((u) => u.token === t);
