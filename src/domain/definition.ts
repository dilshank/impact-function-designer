// Build an impact_definition 1.0 from editor state and validate it against the contract.
import type { Clamp, Model } from './evaluate';
import { blank, num } from './numbers';
import type { DesignerState, Origin, SourceKind } from './state';
import { isExposureUnit, isImpactUnit } from './units';

export interface ValidationError {
  code: 'invalid_value' | 'missing_field' | 'invalid_type' | 'duplicate_identifier' | 'invalid_reference';
  path: string;
  msg: string;
}

export interface ProvenanceOrigin {
  kind: Origin;
  source_id?: string;
  importer_name?: string;
  importer_version?: string;
  importer_build_sha256?: string | null;
  description?: string;
}

export interface ImpactDefinition {
  schema_version: '1.0';
  semantics_version: 'crc-impact/1';
  calibration: { exposure_variable: string; exposure_unit: string; impact_metric: string; impact_unit: string };
  model: Model;
  clamp: Clamp | null;
  provenance: {
    origin: ProvenanceOrigin;
    sources: { id: string; kind: SourceKind; uri: string; revision: string | null; content_sha256: string | null }[];
    derived_from: string[];
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Always returns a definition; numbers that failed to parse are NaN and listed in errors. */
export function buildDefinition(s: DesignerState): { definition: ImpactDefinition; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const E = (code: ValidationError['code'], path: string, msg: string) => errors.push({ code, path, msg });
  const ident = (v: unknown, path: string, label: string) => {
    const t = String(v ?? '');
    if (t === '') E('invalid_value', path, label + ' must not be empty.');
    else if (t !== t.trim()) E('invalid_value', path, label + ' must not start or end with whitespace.');
    return t;
  };
  const req = (raw: string, path: string, label: string) => {
    if (blank(raw)) {
      E('missing_field', path, label + ' is required.');
      return NaN;
    }
    const v = num(raw);
    if (!Number.isFinite(v)) E('invalid_type', path, label + ' must be a finite number.');
    return v;
  };
  const optn = (raw: string, path: string, label: string) => (blank(raw) ? null : req(raw, path, label));

  const c = s.cal;
  const calibration = {
    exposure_variable: ident(c.exposure_variable, '/calibration/exposure_variable', 'Exposure variable'),
    exposure_unit: ident(c.exposure_unit, '/calibration/exposure_unit', 'Exposure unit'),
    impact_metric: ident(c.impact_metric, '/calibration/impact_metric', 'Impact metric'),
    impact_unit: ident(c.impact_unit, '/calibration/impact_unit', 'Impact unit'),
  };
  if (calibration.exposure_unit && !isExposureUnit(calibration.exposure_unit)) {
    E('invalid_value', '/calibration/exposure_unit', '"' + calibration.exposure_unit + '" is not a standard exposure unit.');
  }
  if (calibration.impact_unit && !isImpactUnit(calibration.impact_unit)) {
    E('invalid_value', '/calibration/impact_unit', '"' + calibration.impact_unit + '" is not a standard impact unit.');
  }

  let model: Model;
  if (s.kind === 'linear') {
    model = {
      kind: 'linear',
      slope: req(s.lin.slope, '/model/slope', 'Slope'),
      intercept: blank(s.lin.intercept) ? 0 : req(s.lin.intercept, '/model/intercept', 'Intercept'),
    };
  } else if (s.kind === 'sigmoid') {
    const g = s.sig;
    model = {
      kind: 'sigmoid',
      midpoint: req(g.midpoint, '/model/midpoint', 'Midpoint'),
      steepness: req(g.steepness, '/model/steepness', 'Steepness'),
      offset: blank(g.offset) ? 0 : req(g.offset, '/model/offset', 'Offset'),
      amplitude: blank(g.amplitude) ? 1 : req(g.amplitude, '/model/amplitude', 'Amplitude'),
      origin_adjustment: g.origin === 'subtract_at_zero' ? 'subtract_at_zero' : 'none',
      zero_below: optn(g.zero_below, '/model/zero_below', 'Zero below'),
    };
    if (Number.isFinite(model.amplitude) && model.amplitude < 0) {
      E('invalid_value', '/model/amplitude', 'Amplitude must be zero or more; use a negative steepness for a falling curve.');
    }
  } else if (s.kind === 'tabulated') {
    const pts = s.tab.points.map((p, i) => ({
      x: req(p.x, '/model/points/' + i + '/x', 'Knot ' + (i + 1) + ' x'),
      y: req(p.y, '/model/points/' + i + '/y', 'Knot ' + (i + 1) + ' y'),
    }));
    if (pts.length < 2) E('invalid_value', '/model/points', 'A table needs at least two knots.');
    for (let i = 1; i < pts.length; i++) {
      if (Number.isFinite(pts[i].x) && Number.isFinite(pts[i - 1].x) && !(pts[i].x > pts[i - 1].x)) {
        E('invalid_value', '/model/points/' + i + '/x', 'Knot x values must strictly increase.');
      }
    }
    model = { kind: 'tabulated', points: pts, interpolation: s.tab.interpolation, outside_domain: s.tab.outside };
  } else {
    const edges = s.bin.edges.map((v, i) => req(v, '/model/bin_edges/' + i, 'Edge ' + (i + 1)));
    const values = s.bin.values.map((v, i) => req(v, '/model/values/' + i, 'Bin ' + (i + 1) + ' value'));
    if (edges.length < 2) E('invalid_value', '/model/bin_edges', 'Binned models need at least two edges.');
    for (let i = 1; i < edges.length; i++) {
      if (Number.isFinite(edges[i]) && Number.isFinite(edges[i - 1]) && !(edges[i] > edges[i - 1])) {
        E('invalid_value', '/model/bin_edges/' + i, 'Bin edges must strictly increase.');
      }
    }
    model = { kind: 'binned', bin_edges: edges, values, outside_domain: s.bin.outside };
  }

  const cmin = optn(s.clamp.minimum, '/clamp/minimum', 'Clamp minimum');
  const cmax = optn(s.clamp.maximum, '/clamp/maximum', 'Clamp maximum');
  if (cmin !== null && cmax !== null && Number.isFinite(cmin) && Number.isFinite(cmax) && cmin > cmax) {
    E('invalid_value', '/clamp', 'Minimum must not exceed maximum.');
  }
  const clamp = cmin === null && cmax === null ? null : { minimum: cmin, maximum: cmax };

  const p = s.prov;
  const ids: Record<string, boolean> = {};
  const sources = p.sources.map((src, i) => {
    const id = ident(src.id, '/provenance/sources/' + i + '/id', 'Source id');
    if (id && ids[id]) E('duplicate_identifier', '/provenance/sources/' + i + '/id', 'Source ids must be unique.');
    ids[id] = true;
    const uri = ident(src.uri, '/provenance/sources/' + i + '/uri', 'Source URI');
    const sha = String(src.sha || '').trim();
    if (sha && !HEX64.test(sha)) E('invalid_value', '/provenance/sources/' + i + '/content_sha256', 'Content digest must be 64 lowercase hex characters.');
    return { id, kind: src.kind, uri, revision: blank(src.revision) ? null : String(src.revision).trim(), content_sha256: sha || null };
  });
  const origin: ProvenanceOrigin = { kind: p.origin };
  if (p.origin === 'published' || p.origin === 'imported') {
    origin.source_id = p.source_id;
    if (!p.source_id || !ids[p.source_id]) E('invalid_reference', '/provenance/origin/source_id', 'Pick a source record from this definition.');
  }
  if (p.origin === 'imported') {
    origin.importer_name = ident(p.importer_name, '/provenance/origin/importer_name', 'Importer name');
    origin.importer_version = ident(p.importer_version, '/provenance/origin/importer_version', 'Importer version');
    const bs = String(p.importer_sha || '').trim();
    if (bs && !HEX64.test(bs)) E('invalid_value', '/provenance/origin/importer_build_sha256', 'Build digest must be 64 lowercase hex characters.');
    origin.importer_build_sha256 = bs || null;
  }
  const derived_from: string[] = [];
  if (p.origin === 'derived') {
    if (blank(p.description)) E('missing_field', '/provenance/origin/description', 'Describe the derivation.');
    origin.description = String(p.description || '').trim();
    String(p.derived || '').split(/\s+/).filter(Boolean).forEach((h, i) => {
      if (!/^sha256:[0-9a-f]{64}$/.test(h)) E('invalid_value', '/provenance/derived_from/' + i, 'Parents are sha256: followed by 64 lowercase hex characters.');
      else if (derived_from.indexOf(h) >= 0) E('duplicate_identifier', '/provenance/derived_from/' + i, 'Each parent is listed once.');
      derived_from.push(h);
    });
    if (!derived_from.length) E('invalid_reference', '/provenance/derived_from', 'A derived definition needs at least one parent hash.');
  }

  const definition: ImpactDefinition = {
    schema_version: '1.0',
    semantics_version: 'crc-impact/1',
    calibration,
    model,
    clamp,
    provenance: { origin, sources, derived_from },
  };
  return { definition, errors };
}
