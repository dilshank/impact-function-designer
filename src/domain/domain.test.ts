import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canon, canonNum, definitionHash, sha256, utf8 } from './canonical';
import { buildDefinition } from './definition';
import { evalDef, evalModel, type Model } from './evaluate';
import { stepNumber } from './numbers';
import { defaultState } from './state';

describe('sha256', () => {
  it.each(['', 'abc', 'é ☃ 𝄞', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(1000)])('matches node:crypto for %j', (str) => {
    expect(sha256(utf8(str))).toBe(createHash('sha256').update(str, 'utf8').digest('hex'));
  });
});

describe('canonNum', () => {
  it.each([
    [0, '0.0'], [1, '1.0'], [-2, '-2.0'], [0.1, '0.1'], [123.456, '123.456'], [1e15, '1000000000000000.0'],
    [1e16, '1e+16'], [1e-5, '0.00001'], [1e-6, '1e-6'], [2.5e-7, '2.5e-7'],
  ])('%d → %s', (v, s) => {
    expect(canonNum(v)).toBe(s);
  });
});

describe('canon', () => {
  it('sorts keys and drops whitespace', () => {
    expect(canon({ b: [1, null], a: 'x', c: true })).toBe('{"a":"x","b":[1.0,null],"c":true}');
  });
});

describe('evalModel', () => {
  const tab: Model = { kind: 'tabulated', points: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 2, y: 1 }], interpolation: 'linear', outside_domain: 'clamp' };
  it('interpolates and holds end values', () => {
    expect(evalModel(tab, 0.5)).toBe(0.25);
    expect(evalModel(tab, -1)).toBe(0);
    expect(evalModel(tab, 3)).toBe(1);
  });
  it('steps left and right', () => {
    expect(evalModel({ ...tab, interpolation: 'step_left' }, 0.5)).toBe(0);
    expect(evalModel({ ...tab, interpolation: 'step_right' }, 0.5)).toBe(0.5);
  });
  it('rejects outside the table when outside_domain is error', () => {
    expect(evalModel({ ...tab, outside_domain: 'error' }, 3)).toBeNaN();
  });
  it('puts interior bin edges in the bin on their right and the final edge in the last bin', () => {
    const bin: Model = { kind: 'binned', bin_edges: [0, 1, 2], values: [10, 20], outside_domain: 'clamp' };
    expect(evalModel(bin, 1)).toBe(20);
    expect(evalModel(bin, 2)).toBe(20);
    expect(evalModel(bin, 0.99)).toBe(10);
  });
  it('zeroes a sigmoid strictly below zero_below', () => {
    const sig: Model = { kind: 'sigmoid', midpoint: 5, steepness: 1, offset: 0, amplitude: 1, origin_adjustment: 'none', zero_below: 2 };
    expect(evalModel(sig, 1.9)).toBe(0);
    expect(evalModel(sig, 5)).toBe(0.5);
  });
  it('clamps the final response', () => {
    const lin: Model = { kind: 'linear', slope: 1, intercept: 0 };
    expect(evalDef({ model: lin, clamp: { minimum: 0, maximum: 1 } }, 3)).toBe(1);
    expect(evalDef({ model: lin, clamp: { minimum: 0, maximum: null } }, -3)).toBe(0);
  });
});

describe('buildDefinition', () => {
  it('validates the default state', () => {
    const { errors, definition } = buildDefinition(defaultState());
    expect(errors).toEqual([]);
    expect(definitionHash(definition)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it('reports knots that do not strictly increase', () => {
    const s = defaultState();
    s.tab.points[2].x = '0.1';
    expect(buildDefinition(s).errors).toContainEqual(expect.objectContaining({ path: '/model/points/2/x', code: 'invalid_value' }));
  });
  it('requires a cited source for a published origin', () => {
    const s = defaultState();
    s.prov.origin = 'published';
    expect(buildDefinition(s).errors.map((e) => e.code)).toContain('invalid_reference');
  });
});

describe('stepNumber', () => {
  it('steps by one decimal without float drift', () => {
    let v = '0.2';
    for (let i = 0; i < 7; i++) v = String(stepNumber(v, 1, 0.1));
    expect(v).toBe('0.9');
    expect(stepNumber('0.3', -1, 0.1)).toBe(0.2);
  });
  it('starts from 0 for a blank or unparseable value', () => {
    expect(stepNumber('', 1, 0.1)).toBe(0.1);
    expect(stepNumber('abc', -1, 0.1)).toBe(-0.1);
  });
  it('reads formatted money', () => {
    expect(stepNumber('12,000', 1, 1000)).toBe(13000);
  });
});
