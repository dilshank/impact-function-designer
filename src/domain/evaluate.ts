// crc-impact/1 evaluation semantics.

export type Kind = 'tabulated' | 'binned' | 'sigmoid' | 'linear';
export type OutsideDomain = 'clamp' | 'error';
export type Interpolation = 'linear' | 'step_left' | 'step_right';
export type OriginAdjustment = 'none' | 'subtract_at_zero';

export interface LinearModel {
  kind: 'linear';
  slope: number;
  intercept: number;
}

export interface SigmoidModel {
  kind: 'sigmoid';
  midpoint: number;
  steepness: number;
  offset: number;
  amplitude: number;
  origin_adjustment: OriginAdjustment;
  zero_below: number | null;
}

export interface TabulatedModel {
  kind: 'tabulated';
  points: { x: number; y: number }[];
  interpolation: Interpolation;
  outside_domain: OutsideDomain;
}

export interface BinnedModel {
  kind: 'binned';
  bin_edges: number[];
  values: number[];
  outside_domain: OutsideDomain;
}

export type Model = LinearModel | SigmoidModel | TabulatedModel | BinnedModel;

export interface Clamp {
  minimum: number | null;
  maximum: number | null;
}

export function logistic(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Raw model response; NaN means out_of_domain. */
export function evalModel(m: Model, x: number): number {
  switch (m.kind) {
    case 'linear':
      return m.slope * x + (m.intercept ?? 0);
    case 'sigmoid': {
      if (m.zero_below !== null && m.zero_below !== undefined && x < m.zero_below) return 0;
      const k = m.steepness;
      const off = m.offset ?? 0;
      const amp = m.amplitude ?? 1;
      const L = (z: number) => (k === 0 ? 0.5 : logistic(z));
      let u = L(k * (x - m.midpoint));
      if (m.origin_adjustment === 'subtract_at_zero') u -= L(-k * m.midpoint);
      return off + amp * u;
    }
    case 'tabulated': {
      const p = m.points;
      const n = p.length;
      if (x < p[0].x || x > p[n - 1].x) {
        if (m.outside_domain === 'error') return NaN;
        return x < p[0].x ? p[0].y : p[n - 1].y;
      }
      for (let i = 0; i < n; i++) if (x === p[i].x) return p[i].y;
      for (let i = 0; i < n - 1; i++) {
        if (x > p[i].x && x < p[i + 1].x) {
          if (m.interpolation === 'step_left') return p[i].y;
          if (m.interpolation === 'step_right') return p[i + 1].y;
          return p[i].y + (p[i + 1].y - p[i].y) * ((x - p[i].x) / (p[i + 1].x - p[i].x));
        }
      }
      return p[n - 1].y;
    }
    case 'binned': {
      const e = m.bin_edges;
      const v = m.values;
      const n = e.length;
      if (x < e[0] || x > e[n - 1]) {
        if (m.outside_domain === 'error') return NaN;
        return x < e[0] ? v[0] : v[v.length - 1];
      }
      for (let i = 0; i < n - 1; i++) if (x >= e[i] && x < e[i + 1]) return v[i];
      return v[v.length - 1];
    }
  }
}

/** Final response; NaN for out_of_domain or a non-finite raw result (checked before the clamp). */
export function evalDef(d: { model: Model; clamp: Clamp | null }, x: number): number {
  let y = evalModel(d.model, x);
  if (!Number.isFinite(y)) return NaN;
  if (d.clamp) {
    if (d.clamp.minimum !== null) y = Math.max(d.clamp.minimum, y);
    if (d.clamp.maximum !== null) y = Math.min(d.clamp.maximum, y);
  }
  return y;
}
