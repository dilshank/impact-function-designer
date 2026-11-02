// Chart geometry: plot range, sampled curves, ticks and overlays, in percent of the plot box.
import type { ImpactDefinition } from './definition';
import { evalDef, evalModel, type Clamp, type Model } from './evaluate';
import { fmt, niceStep, num } from './numbers';
import { hazard, impactTick, type ImpactFormat } from './presets';
import type { DesignerState } from './state';

/** Axis bounds; frozen while a handle is dragged so the scale doesn't move under the pointer. */
export interface Frame {
  xmin: number;
  xmax: number;
  yMin: number;
  yHi: number;
}

export type Monotonicity = 'unknown' | 'non_monotone' | 'non_decreasing' | 'non_increasing' | 'constant';

export interface PlotView extends Frame {
  model: Model | null;
  clamp: Clamp | null;
  span: number;
  fFinal: (x: number) => number;
  fRaw: (x: number) => number;
  xp: (x: number) => number;
  yp: (y: number) => number;
  curvePath: string;
  rawPath: string;
  clampBinds: boolean;
  xTicks: { pct: number; label: string }[];
  xMinor: { pct: number }[];
  yTicks: { pct: number; label: string }[];
  yMinor: { pct: number }[];
  zeroX: { show: boolean; pct: number };
  clampLines: { pct: number; label: string }[];
  errorZones: { left: number; width: number }[];
  mono: Monotonicity;
}

export const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The model, if it is complete enough to plot even while the rest of the definition is invalid. */
export function plottableModel(m: Model): Model | null {
  switch (m.kind) {
    case 'tabulated': {
      const ok = m.points.length >= 2 && m.points.every((p, i) => Number.isFinite(p.x) && Number.isFinite(p.y) && (i === 0 || p.x > m.points[i - 1].x));
      return ok ? m : null;
    }
    case 'binned': {
      const ok = m.bin_edges.length >= 2 && m.bin_edges.every((x, i) => Number.isFinite(x) && (i === 0 || x > m.bin_edges[i - 1])) && m.values.every(Number.isFinite);
      return ok ? m : null;
    }
    case 'sigmoid':
      return [m.midpoint, m.steepness, m.offset, m.amplitude].every(Number.isFinite) && (m.zero_below === null || Number.isFinite(m.zero_below)) ? m : null;
    case 'linear':
      return Number.isFinite(m.slope) && Number.isFinite(m.intercept) ? m : null;
  }
}

function plottableClamp(c: Clamp | null): Clamp | null {
  return c && (c.minimum === null || Number.isFinite(c.minimum)) && (c.maximum === null || Number.isFinite(c.maximum)) ? c : null;
}

/** x positions where the function may jump: knots, bin edges, a sigmoid's zero_below. */
function breakpoints(m: Model | null): number[] {
  if (!m) return [];
  if (m.kind === 'tabulated') return m.points.map((p) => p.x);
  if (m.kind === 'binned') return m.bin_edges.slice();
  if (m.kind === 'sigmoid' && m.zero_below !== null) return [m.zero_below];
  return [];
}

export function computePlot(s: DesignerState, def: ImpactDefinition, u: ImpactFormat, frozen: Frame | null): PlotView {
  const model = plottableModel(def.model);
  const clamp = plottableClamp(def.clamp);
  const fFinal = (x: number) => (model ? evalDef({ model, clamp }, x) : NaN);
  const fRaw = (x: number) => (model ? evalModel(model, x) : NaN);

  // Domain: the requested range, widened to cover every knot or bin edge.
  let xmin = num(s.xMin);
  let xmax = num(s.xMax);
  const hz = hazard(s.cal.preset);
  if (!Number.isFinite(xmin)) xmin = hz.domain[0];
  if (!Number.isFinite(xmax)) xmax = hz.domain[1];
  const breaks = breakpoints(model);
  if (breaks.length && model && (model.kind === 'tabulated' || model.kind === 'binned')) {
    xmin = Math.min(xmin, breaks[0]);
    xmax = Math.max(xmax, breaks[breaks.length - 1]);
  }
  if (!(xmax > xmin)) xmax = xmin + 1;
  if (frozen) {
    xmin = frozen.xmin;
    xmax = frozen.xmax;
  }
  const span = xmax - xmin;

  // Samples, with exact breakpoints so steps and thresholds draw as vertical jumps.
  const xsAll: number[] = [];
  for (let i = 0; i <= 400; i++) xsAll.push(xmin + (span * i) / 400);
  const eps = span * 1e-7;
  breaks.forEach((b) => { if (b >= xmin && b <= xmax) xsAll.push(b - eps, b, b + eps); });
  const xs = xsAll.filter((x) => x >= xmin && x <= xmax).sort((a, b) => a - b);
  const fin = xs.map((x) => ({ x, y: fFinal(x) }));
  const raw = xs.map((x) => ({ x, y: fRaw(x) }));
  const clampBinds = !!clamp && raw.some((p, i) => Number.isFinite(p.y) && Math.abs(p.y - fin[i].y) > 1e-12);

  const ys = fin.concat(clampBinds ? raw : []).map((p) => p.y).filter(Number.isFinite);
  if (clamp) (['minimum', 'maximum'] as const).forEach((k) => { if (clamp[k] !== null) ys.push(clamp[k] as number); });
  const yLo = Math.min(0, ...ys);
  let yHi = Math.max(0, ...ys);
  if (s.cal.impactPreset === 'damage_ratio') yHi = Math.max(yHi, 1);
  if (yHi <= yLo) yHi = yLo + 1;
  const yStep = niceStep(yHi - yLo);
  yHi = Math.ceil(yHi / yStep - 1e-9) * yStep;
  let yMin = Math.floor(yLo / yStep + 1e-9) * yStep;
  if (frozen) {
    yMin = frozen.yMin;
    yHi = frozen.yHi;
  }

  const xp = (x: number) => ((x - xmin) / span) * 100;
  const yp = (y: number) => ((y - yMin) / (yHi - yMin)) * 100;
  // SVG paths in a 1000 × 1000 viewBox; non-finite samples lift the pen.
  const toPath = (pts: { x: number; y: number }[]) => {
    let d = '';
    let pen = false;
    pts.forEach((p) => {
      if (!Number.isFinite(p.y)) {
        pen = false;
        return;
      }
      d += (pen ? 'L' : 'M') + r1(xp(p.x) * 10) + ' ' + r1(1000 - yp(p.y) * 10) + ' ';
      pen = true;
    });
    return d.trim();
  };

  const xStep = niceStep(span);
  const xTicks: PlotView['xTicks'] = [];
  const xMinor: PlotView['xMinor'] = [];
  const xFirst = Math.ceil(xmin / xStep - 1e-9) * xStep;
  for (let v = xFirst; v <= xmax + 1e-9; v += xStep) xTicks.push({ pct: r2(xp(v)), label: fmt(v, 2) });
  for (let v = xFirst - xStep / 2; v <= xmax + 1e-9; v += xStep) if (v >= xmin - 1e-9) xMinor.push({ pct: r2(xp(v)) });
  const yTicks: PlotView['yTicks'] = [];
  const yMinor: PlotView['yMinor'] = [];
  for (let v = yMin; v <= yHi + 1e-9; v += yStep) yTicks.push({ pct: r2(yp(v)), label: impactTick(v, u) });
  for (let v = yMin + yStep / 2; v < yHi; v += yStep) yMinor.push({ pct: r2(yp(v)) });

  const clampLines = clamp
    ? (['minimum', 'maximum'] as const)
        .filter((k) => clamp[k] !== null)
        .map((k) => ({ pct: r2(yp(clamp[k] as number)), label: 'clamp ' + (k === 'minimum' ? 'min ' : 'max ') + impactTick(clamp[k] as number, u) }))
    : [];
  const errorZones: PlotView['errorZones'] = [];
  if (model && (model.kind === 'tabulated' || model.kind === 'binned') && model.outside_domain === 'error') {
    const d0 = breaks[0];
    const d1 = breaks[breaks.length - 1];
    if (d0 > xmin) errorZones.push({ left: 0, width: r2(xp(d0)) });
    if (d1 < xmax) errorZones.push({ left: r2(xp(d1)), width: r2(100 - xp(d1)) });
  }

  // Monotonicity of the full function over the plotted range.
  let up = false;
  let down = false;
  const finY = fin.filter((p) => Number.isFinite(p.y));
  const tol = 1e-12 * Math.max(1, ...finY.map((p) => Math.abs(p.y)));
  for (let i = 1; i < finY.length; i++) {
    const dy = finY[i].y - finY[i - 1].y;
    if (dy > tol) up = true;
    if (dy < -tol) down = true;
  }
  const mono: Monotonicity = !model ? 'unknown' : up && down ? 'non_monotone' : up ? 'non_decreasing' : down ? 'non_increasing' : 'constant';

  return {
    model, clamp, xmin, xmax, yMin, yHi, span, fFinal, fRaw, xp, yp,
    curvePath: toPath(fin),
    rawPath: clampBinds ? toPath(raw) : '',
    clampBinds, xTicks, xMinor, yTicks, yMinor,
    zeroX: { show: xmin < 0 && xmax > 0, pct: r2(xp(0)) },
    clampLines, errorZones, mono,
  };
}
