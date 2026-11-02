// Editor state. Numeric fields stay as the strings the user typed; buildDefinition parses them.
import { evalModel, type Interpolation, type Kind, type Model, type OriginAdjustment, type OutsideDomain } from './evaluate';
import { fmtImpactNum, hazard, impact, impactFmt, type HazardId, type ImpactId } from './presets';
import { blank, num, plain, round6 } from './numbers';

export type Origin = 'user_defined' | 'published' | 'imported' | 'derived';
export type SourceKind = 'publication' | 'dataset' | 'code' | 'definition';
export type ExportTab = 'definition' | 'canonical' | 'python' | 'csv';

export interface SourceRow {
  id: string;
  kind: SourceKind;
  uri: string;
  revision: string;
  sha: string;
}

export interface ModelDrafts {
  kind: Kind;
  tab: { interpolation: Interpolation; outside: OutsideDomain; points: { x: string; y: string }[] };
  bin: { outside: OutsideDomain; edges: string[]; values: string[] };
  sig: { midpoint: string; steepness: string; offset: string; amplitude: string; origin: OriginAdjustment; zero_below: string };
  lin: { slope: string; intercept: string };
  clamp: { minimum: string; maximum: string };
}

export interface DesignerState extends ModelDrafts {
  cal: {
    preset: HazardId;
    exposure_variable: string;
    exposure_unit: string;
    impactPreset: ImpactId;
    impact_metric: string;
    impact_unit: string;
  };
  xMin: string;
  xMax: string;
  probe: number;
  prov: {
    origin: Origin;
    source_id: string;
    importer_name: string;
    importer_version: string;
    importer_sha: string;
    description: string;
    derived: string;
    sources: SourceRow[];
  };
  exportTab: ExportTab;
  editOn: boolean;
}

/** Seed every model kind from a hazard's starter so switching kinds keeps a comparable curve. */
export function seedModels(presetId: HazardId, impactPreset: ImpactId): ModelDrafts {
  const h = hazard(presetId);
  const ip = impact(impactPreset);
  const sm = h.starter;
  const [a, b] = h.domain;
  const span = b - a;
  const numModel: Model = sm.kind === 'tabulated' ? { ...sm, points: sm.points.map(([x, y]) => ({ x, y })) } : sm;
  const f = (x: number) => evalModel(numModel, x);
  const fi = (v: number) => fmtImpactNum(v, ip);
  const xs = [0, 1, 2, 3, 4].map((i) => round6(a + (span * i) / 4));

  const tab: ModelDrafts['tab'] =
    sm.kind === 'tabulated'
      ? { interpolation: sm.interpolation, outside: sm.outside_domain, points: sm.points.map(([x, y]) => ({ x: plain(x), y: fi(y) })) }
      : { interpolation: 'linear', outside: 'clamp', points: xs.map((x) => ({ x: plain(x), y: fi(f(x)) })) };
  const bin: ModelDrafts['bin'] =
    sm.kind === 'binned'
      ? { outside: sm.outside_domain, edges: sm.bin_edges.map(plain), values: sm.values.map(fi) }
      : { outside: 'clamp', edges: xs.map(plain), values: xs.slice(0, 4).map((x, i) => fi(f((x + xs[i + 1]) / 2))) };
  const lo = f(a);
  const hi = f(b);
  const sig: ModelDrafts['sig'] =
    sm.kind === 'sigmoid'
      ? {
          midpoint: plain(sm.midpoint), steepness: plain(sm.steepness), offset: fi(sm.offset), amplitude: fi(sm.amplitude),
          origin: sm.origin_adjustment, zero_below: sm.zero_below === null ? '' : plain(sm.zero_below),
        }
      : {
          midpoint: plain(round6(a + span / 2)), steepness: plain(round6((hi >= lo ? 8 : -8) / span)),
          offset: fi(Math.min(lo, hi)), amplitude: fi(Math.abs(hi - lo)), origin: 'none', zero_below: '',
        };
  const slope = (hi - lo) / span;
  const lin: ModelDrafts['lin'] =
    sm.kind === 'linear'
      ? { slope: plain(sm.slope), intercept: fi(sm.intercept) }
      : { slope: plain(round6(slope)), intercept: fi(round6(lo - slope * a)) };
  const clamp = h.clamp ? { minimum: fi(h.clamp[0]), maximum: fi(h.clamp[1]) } : { minimum: '', maximum: '' };
  return { kind: sm.kind, tab, bin, sig, lin, clamp };
}

export function defaultState(): DesignerState {
  return {
    cal: { preset: 'flood', exposure_variable: 'flood_depth', exposure_unit: 'm', impactPreset: 'damage_ratio', impact_metric: 'damage_ratio', impact_unit: '1' },
    xMin: '0',
    xMax: '5',
    probe: 1,
    prov: { origin: 'user_defined', source_id: '', importer_name: '', importer_version: '', importer_sha: '', description: '', derived: '', sources: [] },
    exportTab: 'definition',
    editOn: true,
    ...seedModels('flood', 'damage_ratio'),
  };
}

/** Switching hazard reseeds every model kind and resets the plot range. */
export function applyHazardPreset(c: DesignerState, id: HazardId): void {
  const h = hazard(id);
  Object.assign(c, seedModels(id, c.cal.impactPreset));
  c.cal.preset = id;
  c.cal.exposure_variable = h.variable;
  c.cal.exposure_unit = h.unit;
  c.xMin = String(h.domain[0]);
  c.xMax = String(h.domain[1]);
  c.probe = h.domain[0] + (h.domain[1] - h.domain[0]) * 0.4;
}

/** Switching impact preset reformats every impact value; ratio ↔ percent also rescales them. */
export function applyImpactPreset(c: DesignerState, id: ImpactId): void {
  const from = c.cal.impactPreset;
  const ip = impact(id);
  const factor = from === 'damage_ratio' && id === 'damage_percent' ? 100 : from === 'damage_percent' && id === 'damage_ratio' ? 0.01 : 1;
  c.cal.impactPreset = id;
  c.cal.impact_metric = ip.metric;
  c.cal.impact_unit = ip.unit;
  const nu = impactFmt(c.cal);
  const conv = (raw: string) => {
    if (blank(raw)) return raw;
    const v = num(raw);
    return Number.isFinite(v) ? fmtImpactNum(v * factor, nu) : raw;
  };
  c.tab.points.forEach((p) => { p.y = conv(p.y); });
  c.bin.values = c.bin.values.map(conv);
  c.sig.offset = conv(c.sig.offset);
  c.sig.amplitude = conv(c.sig.amplitude);
  c.lin.intercept = conv(c.lin.intercept);
  const sl = num(c.lin.slope);
  if (Number.isFinite(sl)) c.lin.slope = plain(sl * factor);
  c.clamp.minimum = conv(c.clamp.minimum);
  c.clamp.maximum = conv(c.clamp.maximum);
}
