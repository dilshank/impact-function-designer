import { describe, expect, it } from 'vitest';
import { canon, definitionHash, pretty } from './canonical';
import { buildDefinition } from './definition';
import type { Kind } from './evaluate';
import { csvExport } from './exports';
import { importText } from './importer';
import { computePlot } from './plot';
import { HAZARDS, IMPACTS, impactFmt, type HazardId, type ImpactId } from './presets';
import { applyHazardPreset, applyImpactPreset, defaultState, type DesignerState } from './state';
import { EXPOSURE_UNITS, impactUnitsFor, isExposureUnit, isImpactUnit } from './units';

const KINDS: Kind[] = ['tabulated', 'binned', 'sigmoid', 'linear'];

function stateFor(hz: HazardId, ip: ImpactId, kind: Kind): DesignerState {
  const s = defaultState();
  applyImpactPreset(s, ip);
  applyHazardPreset(s, hz);
  return { ...s, kind };
}

function imported(text: string, into = defaultState()): DesignerState {
  const r = importText(text, into);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.state;
}

describe('units', () => {
  it('covers every preset unit', () => {
    for (const h of Object.values(HAZARDS)) expect(isExposureUnit(h.unit), h.unit).toBe(true);
    for (const id of Object.keys(IMPACTS) as ImpactId[]) {
      expect(impactUnitsFor(id).map((u) => u.token), id).toContain(IMPACTS[id].unit);
      expect(isImpactUnit(IMPACTS[id].unit)).toBe(true);
    }
  });

  it('has no duplicate tokens', () => {
    const tokens = EXPOSURE_UNITS.map((u) => u.token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('rejects a non-standard unit', () => {
    const s = defaultState();
    s.cal.exposure_unit = 'furlongs';
    s.cal.impact_unit = 'beans';
    const paths = buildDefinition(s).errors.map((e) => e.path);
    expect(paths).toContain('/calibration/exposure_unit');
    expect(paths).toContain('/calibration/impact_unit');
  });
});

describe('import round-trip keeps the definition_hash', () => {
  for (const hz of Object.keys(HAZARDS) as HazardId[]) {
    for (const ip of Object.keys(IMPACTS) as ImpactId[]) {
      it(`${hz} × ${ip}`, () => {
        for (const kind of KINDS) {
          const { definition, errors } = buildDefinition(stateFor(hz, ip, kind));
          expect(errors).toEqual([]);
          const hash = definitionHash(definition);
          for (const text of [pretty(definition), canon(definition)]) {
            // Import into an unrelated editor state; nothing from it may leak in.
            const back = buildDefinition(imported(text, stateFor('wind', 'loss', 'linear')));
            expect(back.errors, `${kind}`).toEqual([]);
            expect(definitionHash(back.definition), `${kind}`).toBe(hash);
          }
        }
      });
    }
  }

  it('keeps provenance, sources and exact long decimals', () => {
    const s = defaultState();
    s.tab.points[1].y = '0.123456789012';
    s.prov = {
      origin: 'imported', source_id: 'jrc', importer_name: 'jrc-curves', importer_version: '2.1.0', importer_sha: 'a'.repeat(64),
      description: '', derived: '', sources: [{ id: 'jrc', kind: 'dataset', uri: 'https://example.org/jrc', revision: '2017', sha: 'b'.repeat(64) }],
    };
    const { definition } = buildDefinition(s);
    const back = imported(pretty(definition));
    expect(back.prov).toEqual(s.prov);
    expect(definitionHash(buildDefinition(back).definition)).toBe(definitionHash(definition));
  });

  it('infers the presets so the unit dropdowns show the imported units', () => {
    const back = imported(pretty(buildDefinition(stateFor('frost', 'damage_percent', 'binned')).definition));
    expect(back.cal.preset).toBe('frost');
    expect(back.cal.impactPreset).toBe('damage_percent');
    expect(back.kind).toBe('binned');
  });
});

describe('import of hand-written definitions', () => {
  it('fills defaults and reports what it assumed', () => {
    const r = importText(JSON.stringify({
      calibration: { exposure_variable: 'surge_height', exposure_unit: 'm', impact_metric: 'damage_ratio', impact_unit: '1' },
      model: { kind: 'tabulated', points: [[0, 0], [1, 0.4], [3, 1]] },
      definition_hash: 'sha256:00',
    }), defaultState());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.join(' ')).toMatch(/schema_version.*semantics_version.*interpolation|definition_hash/s);
    expect(r.state.cal.preset).toBe('custom');
    expect(r.state.tab.points).toEqual([{ x: '0', y: '0' }, { x: '1', y: '0.4' }, { x: '3', y: '1' }]);
    expect(buildDefinition(r.state).errors).toEqual([]);
  });

  it('keeps a non-standard unit visible and flags it', () => {
    const r = importText(JSON.stringify({
      schema_version: '1.0', semantics_version: 'crc-impact/1',
      calibration: { exposure_variable: 'x', exposure_unit: 'ft', impact_metric: 'loss', impact_unit: 'USD' },
      model: { kind: 'linear', slope: 1 },
    }), defaultState());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cal.exposure_unit).toBe('ft');
    expect(r.state.cal.impactPreset).toBe('loss');
    expect(buildDefinition(r.state).errors.map((e) => e.path)).toEqual(['/calibration/exposure_unit']);
  });

  it.each([
    ['{ not json', /Not valid JSON/],
    ['[]', /Not valid JSON|Expected a JSON object/],
    ['{"schema_version":"2.0","calibration":{},"model":{"kind":"linear","slope":1}}', /Unsupported schema_version/],
    ['{"calibration":{},"model":{"kind":"spline"}}', /model.kind must be one of/],
    ['{"calibration":{},"model":{"kind":"binned","bin_edges":[0,1,2],"values":[1]}}', /one value per bin/],
    ['{"calibration":{},"model":{"kind":"linear","slope":"1"}}', /model.slope must be a finite number/],
  ])('rejects %s', (text, msg) => {
    const r = importText(text, defaultState());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(msg);
  });
});

describe('CSV import', () => {
  const csvOf = (s: DesignerState) => {
    const { definition } = buildDefinition(s);
    return csvExport(s, definition, computePlot(s, definition, impactFmt(s.cal), null));
  };

  it('reads exported knots back as the same model', () => {
    const s = stateFor('rx1day', 'damage_ratio', 'tabulated');
    const back = imported(csvOf(s), defaultState());
    expect(back.kind).toBe('tabulated');
    expect(buildDefinition(back).definition.model).toEqual(buildDefinition(s).definition.model);
  });

  it('reads exported bins back as the same model', () => {
    const s = stateFor('frost', 'damage_ratio', 'binned');
    const back = imported(csvOf(s), s);
    expect(buildDefinition(back).definition.model).toEqual(buildDefinition(s).definition.model);
  });

  it('rejects gaps between bins', () => {
    const r = importText('0,1,0.1\n2,3,0.2', defaultState());
    expect(r.ok).toBe(false);
  });
});
