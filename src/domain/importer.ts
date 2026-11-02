// Import an impact definition (JSON or canonical JSON) or a knots/bins CSV into editor state.
// Numbers are carried over exactly (String(v), not the display format), so an untouched
// import re-exports with the same definition_hash.
import type { Interpolation, Kind, OriginAdjustment, OutsideDomain } from './evaluate';
import { plain } from './numbers';
import { HAZARDS, IMPACTS, hazard, type HazardId, type ImpactId } from './presets';
import { seedModels, type DesignerState, type Origin, type SourceKind } from './state';
import { impactUnitsFor, isCurrencyUnit } from './units';

export type ImportResult =
  | { ok: true; state: DesignerState; summary: string; warnings: string[] }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

const KINDS: Kind[] = ['tabulated', 'binned', 'sigmoid', 'linear'];
const INTERPOLATIONS: Interpolation[] = ['linear', 'step_left', 'step_right'];
const OUTSIDE: OutsideDomain[] = ['clamp', 'error'];
const ORIGINS: Origin[] = ['user_defined', 'published', 'imported', 'derived'];
const SOURCE_KINDS: SourceKind[] = ['publication', 'dataset', 'code', 'definition'];
const TOP_LEVEL = ['schema_version', 'semantics_version', 'calibration', 'model', 'clamp', 'provenance'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: number) => String(v);

export function importText(text: string, current: DesignerState): ImportResult {
  const t = text.trim();
  if (!t) return { ok: false, errors: ['Nothing to import.'] };
  return t.startsWith('{') || t.startsWith('[') ? importJson(t, current) : importCsv(t, current);
}

// ---------- JSON definitions ----------

function importJson(text: string, current: DesignerState): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ['Not valid JSON: ' + (e as Error).message] };
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(parsed)) return { ok: false, errors: ['Expected a JSON object.'] };
  let d: Obj = parsed;
  // Tolerate { "definition": {...}, "definition_hash": ... } wrappers.
  if (!('model' in d) && isObj(d.definition)) {
    d = d.definition;
    warnings.push('Read the definition from its "definition" wrapper.');
  }

  for (const k of Object.keys(d)) if (!TOP_LEVEL.includes(k)) warnings.push('Ignored unknown field "' + k + '".');
  if (d.schema_version === undefined) warnings.push('No schema_version; read as 1.0.');
  else if (d.schema_version !== '1.0') errors.push('Unsupported schema_version ' + JSON.stringify(d.schema_version) + '; expected "1.0".');
  if (d.semantics_version === undefined) warnings.push('No semantics_version; read as crc-impact/1.');
  else if (d.semantics_version !== 'crc-impact/1') errors.push('Unsupported semantics_version ' + JSON.stringify(d.semantics_version) + '; expected "crc-impact/1".');

  // Calibration: strings, possibly empty; the editor flags empty ones.
  const cal = isObj(d.calibration) ? d.calibration : {};
  if (!isObj(d.calibration)) errors.push('calibration must be an object.');
  const calStr = (k: string) => {
    const v = cal[k];
    if (v === undefined) return '';
    if (typeof v !== 'string') {
      errors.push('calibration.' + k + ' must be a string.');
      return '';
    }
    return v;
  };
  const exposure_variable = calStr('exposure_variable');
  const exposure_unit = calStr('exposure_unit');
  const impact_metric = calStr('impact_metric');
  const impact_unit = calStr('impact_unit');

  const hazardId = (Object.keys(HAZARDS) as HazardId[]).find((id) => id !== 'custom' && HAZARDS[id].variable === exposure_variable) ?? 'custom';
  const impactId = inferImpactPreset(impact_metric, impact_unit);

  // Model
  const m = isObj(d.model) ? d.model : null;
  if (!m) errors.push('model must be an object.');
  const kind = m?.kind as Kind;
  if (m && !KINDS.includes(kind)) errors.push('model.kind must be one of ' + KINDS.join(', ') + '.');
  if (errors.length) return { ok: false, errors };

  const drafts = seedModels(hazardId, impactId);
  drafts.kind = kind;
  const model = m as Obj;
  const reqNum = (k: string): string => {
    if (!isNum(model[k])) {
      errors.push('model.' + k + ' must be a finite number.');
      return '';
    }
    return str(model[k] as number);
  };
  const optNum = (k: string, fallback: string): string => (model[k] === undefined || model[k] === null ? fallback : reqNum(k));
  const pick = <T extends string>(k: string, allowed: T[], fallback: T): T => {
    const v = model[k];
    if (v === undefined) {
      warnings.push('No model.' + k + '; assumed "' + fallback + '".');
      return fallback;
    }
    if (!allowed.includes(v as T)) {
      errors.push('model.' + k + ' must be one of ' + allowed.join(', ') + '.');
      return fallback;
    }
    return v as T;
  };
  let extent: [number, number] | null = null;

  if (kind === 'tabulated') {
    const pts = model.points;
    if (!Array.isArray(pts)) errors.push('model.points must be an array.');
    else {
      drafts.tab.points = pts.map((p, i) => {
        const xy = Array.isArray(p) ? { x: p[0], y: p[1] } : isObj(p) ? p : {};
        if (!isNum(xy.x) || !isNum(xy.y)) {
          errors.push('model.points[' + i + '] must have finite numbers x and y.');
          return { x: '', y: '' };
        }
        return { x: str(xy.x), y: str(xy.y) };
      });
      if (pts.some(Array.isArray)) warnings.push('Read [x, y] pairs as points.');
      const xs = pts.map((p) => (Array.isArray(p) ? p[0] : isObj(p) ? p.x : NaN)).filter(isNum);
      if (xs.length) extent = [Math.min(...xs), Math.max(...xs)];
    }
    drafts.tab.interpolation = pick('interpolation', INTERPOLATIONS, 'linear');
    drafts.tab.outside = pick('outside_domain', OUTSIDE, 'clamp');
  } else if (kind === 'binned') {
    const edges = model.bin_edges;
    const values = model.values;
    if (!Array.isArray(edges) || !edges.every(isNum)) errors.push('model.bin_edges must be an array of finite numbers.');
    else if (!Array.isArray(values) || !values.every(isNum)) errors.push('model.values must be an array of finite numbers.');
    else if (values.length !== edges.length - 1) errors.push('model.values needs one value per bin: ' + (edges.length - 1) + ' for ' + edges.length + ' edges, got ' + values.length + '.');
    else {
      drafts.bin.edges = edges.map(str);
      drafts.bin.values = values.map(str);
      extent = [edges[0], edges[edges.length - 1]];
    }
    drafts.bin.outside = pick('outside_domain', OUTSIDE, 'clamp');
  } else if (kind === 'sigmoid') {
    drafts.sig = {
      midpoint: reqNum('midpoint'),
      steepness: reqNum('steepness'),
      offset: optNum('offset', ''),
      amplitude: optNum('amplitude', ''),
      origin: model.origin_adjustment === undefined ? 'none' : pick<OriginAdjustment>('origin_adjustment', ['none', 'subtract_at_zero'], 'none'),
      zero_below: optNum('zero_below', ''),
    };
  } else {
    drafts.lin = { slope: reqNum('slope'), intercept: optNum('intercept', '') };
  }

  // Clamp
  drafts.clamp = { minimum: '', maximum: '' };
  if (d.clamp !== undefined && d.clamp !== null) {
    if (!isObj(d.clamp)) errors.push('clamp must be an object or null.');
    else {
      for (const k of ['minimum', 'maximum'] as const) {
        const v = d.clamp[k];
        if (v === undefined || v === null) continue;
        if (!isNum(v)) errors.push('clamp.' + k + ' must be a finite number or null.');
        else drafts.clamp[k] = str(v);
      }
    }
  }

  // Provenance
  const prov: DesignerState['prov'] = { origin: 'user_defined', source_id: '', importer_name: '', importer_version: '', importer_sha: '', description: '', derived: '', sources: [] };
  if (d.provenance === undefined) warnings.push('No provenance; set to user-defined.');
  else if (!isObj(d.provenance)) errors.push('provenance must be an object.');
  else {
    const p = d.provenance;
    const o = isObj(p.origin) ? p.origin : {};
    if (o.kind !== undefined && !ORIGINS.includes(o.kind as Origin)) errors.push('provenance.origin.kind must be one of ' + ORIGINS.join(', ') + '.');
    else prov.origin = (o.kind as Origin) ?? 'user_defined';
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    prov.source_id = s(o.source_id);
    prov.importer_name = s(o.importer_name);
    prov.importer_version = s(o.importer_version);
    prov.importer_sha = s(o.importer_build_sha256);
    prov.description = s(o.description);
    if (Array.isArray(p.derived_from)) prov.derived = p.derived_from.filter((h) => typeof h === 'string').join('\n');
    if (p.sources !== undefined && !Array.isArray(p.sources)) errors.push('provenance.sources must be an array.');
    else if (Array.isArray(p.sources)) {
      prov.sources = p.sources.map((src, i) => {
        const r = isObj(src) ? src : {};
        if (!isObj(src)) errors.push('provenance.sources[' + i + '] must be an object.');
        const kindOk = SOURCE_KINDS.includes(r.kind as SourceKind);
        if (r.kind !== undefined && !kindOk) warnings.push('provenance.sources[' + i + '].kind "' + String(r.kind) + '" is not standard; set to publication.');
        return { id: s(r.id), kind: kindOk ? (r.kind as SourceKind) : 'publication', uri: s(r.uri), revision: s(r.revision), sha: s(r.content_sha256) };
      });
    }
  }

  if (errors.length) return { ok: false, errors };

  const range = plotRange(hazardId, kind, drafts, extent);
  const state: DesignerState = {
    ...current,
    ...drafts,
    cal: { preset: hazardId, exposure_variable, exposure_unit, impactPreset: impactId, impact_metric, impact_unit },
    xMin: plain(range[0]),
    xMax: plain(range[1]),
    probe: range[0] + (range[1] - range[0]) * 0.4,
    prov,
    editOn: true,
  };
  const kindLabel = kind + ' model';
  const what = exposure_variable && impact_metric ? exposure_variable + ' → ' + impact_metric : 'definition';
  return { ok: true, state, summary: 'Imported a ' + kindLabel + ': ' + what + '.', warnings };
}

/** The impact preset whose metric matches; else by unit; else custom. */
function inferImpactPreset(metric: string, unit: string): ImpactId {
  const ids = Object.keys(IMPACTS) as ImpactId[];
  const byMetric = ids.find((id) => id !== 'custom' && IMPACTS[id].metric === metric && impactUnitsFor(id).some((u) => u.token === unit));
  if (byMetric) return byMetric;
  if (isCurrencyUnit(unit)) return 'loss';
  return 'custom';
}

/** A plot range that shows the whole model: the hazard's domain, or the model's own extent. */
function plotRange(hazardId: HazardId, kind: Kind, drafts: ReturnType<typeof seedModels>, extent: [number, number] | null): [number, number] {
  if (extent && extent[1] > extent[0]) return extent;
  if (hazardId !== 'custom') return hazard(hazardId).domain;
  if (kind === 'sigmoid') {
    const mid = Number(drafts.sig.midpoint);
    const k = Math.abs(Number(drafts.sig.steepness));
    const half = k > 0 ? 6 / k : 1;
    const zb = drafts.sig.zero_below === '' ? NaN : Number(drafts.sig.zero_below);
    const lo = Number.isFinite(zb) ? Math.min(zb, mid - half) : mid - half;
    return [Math.min(0, lo), mid + half];
  }
  return hazard('custom').domain;
}

// ---------- CSV (as exported: x,y knots or lower_edge,upper_edge,value bins) ----------

function importCsv(text: string, current: DesignerState): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => l.split(/[,;\t]/).map((c) => c.trim()));
  const numeric = (r: string[]) => r.every((c) => c !== '' && Number.isFinite(Number(c)));
  const hasHeader = !numeric(rows[0]);
  const body = hasHeader ? rows.slice(1) : rows;
  const errors: string[] = [];
  body.forEach((r, i) => { if (!numeric(r)) errors.push('Line ' + (i + 1 + (hasHeader ? 1 : 0)) + ' is not all numbers: ' + r.join(',')); });
  const width = body[0]?.length ?? 0;
  if (body.some((r) => r.length !== width)) errors.push('Every row needs the same number of columns.');
  if (width !== 2 && width !== 3) errors.push('Expected 2 columns (x, y knots) or 3 columns (lower_edge, upper_edge, value bins); got ' + width + '.');
  if (body.length < (width === 3 ? 1 : 2)) errors.push(width === 3 ? 'Need at least one bin.' : 'Need at least two knots.');
  if (errors.length) return { ok: false, errors };

  const state = structuredClone(current);
  const nums = body.map((r) => r.map(Number));
  let extent: [number, number];
  if (width === 2) {
    state.kind = 'tabulated';
    state.tab.points = nums.map(([x, y]) => ({ x: str(x), y: str(y) }));
    extent = [nums[0][0], nums[nums.length - 1][0]];
  } else {
    for (let i = 1; i < nums.length; i++) {
      if (nums[i][0] !== nums[i - 1][1]) return { ok: false, errors: ['Bins must be contiguous: line ' + (i + 1 + (hasHeader ? 1 : 0)) + ' starts at ' + nums[i][0] + ' but the previous bin ends at ' + nums[i - 1][1] + '.'] };
    }
    state.kind = 'binned';
    state.bin.edges = [...nums.map((r) => str(r[0])), str(nums[nums.length - 1][1])];
    state.bin.values = nums.map((r) => str(r[2]));
    extent = [nums[0][0], nums[nums.length - 1][1]];
  }
  if (extent[1] > extent[0]) {
    state.xMin = plain(extent[0]);
    state.xMax = plain(extent[1]);
    state.probe = extent[0] + (extent[1] - extent[0]) * 0.4;
  }
  const n = width === 2 ? body.length + ' knots' : body.length + ' bins';
  return {
    ok: true,
    state,
    summary: 'Imported ' + n + ' from CSV as a ' + state.kind + ' model.',
    warnings: ['CSV carries only the model; calibration, clamp and provenance were kept as they were.'],
  };
}
