// Direct manipulation on the chart: every handle writes the same model values the lists edit.
import { fmt, niceStep, num, plain, round6 } from './numbers';
import type { PlotView } from './plot';
import { fmtImpactNum, impactTick, type ImpactFormat } from './presets';
import type { DesignerState } from './state';

export type HandleShape = 'knot' | 'bar' | 'edge' | 'param' | 'clamp';
export type HandleAxes = 'xy' | 'x' | 'y';

export interface HandleSpec {
  id: string;
  shape: HandleShape;
  axes: HandleAxes;
  /** Current position in data units. */
  x: number;
  y: number;
  label?: string;
  aria: string;
  /** Write a new data-space position into a draft of the state. */
  apply: (c: DesignerState, x: number, y: number) => void;
}

export interface Handles {
  handles: HandleSpec[];
  /** Vertical dotted guides, in percent of the plot width. */
  guides: number[];
  /** Arrow-key x step. */
  xSnap: number;
}

export const EDIT_HINTS: Record<string, string> = {
  tabulated: 'Drag a knot to move it; it stays between its neighbours. Arrow keys nudge the focused knot.',
  binned: 'Drag a bar up or down to change a bin value; drag a boundary between bins sideways. The outer edges are set in the list.',
  sigmoid: 'Drag the midpoint or steepness handle sideways, and the top or base bar up or down.',
  linear: 'Drag either point up or down; the line passes through both.',
};

export function buildHandles(view: PlotView, u: ImpactFormat, xu: string): Handles {
  const { model, clamp, xmin, xmax, span, fRaw } = view;
  const xSnap = niceStep(span) / 20;
  const snapX = (v: number) => round6(Math.round(v / xSnap) * xSnap);
  const snapY = (v: number) => Math.round(v / u.step) * u.step;
  const fx = (v: number) => plain(snapX(v));
  const fy = (v: number) => fmtImpactNum(snapY(v), u);
  const inX = (v: number) => Math.min(xmax, Math.max(xmin, v));
  const handles: HandleSpec[] = [];
  const guides: number[] = [];
  if (!model) return { handles, guides, xSnap };

  if (model.kind === 'tabulated') {
    model.points.forEach((p, i) =>
      handles.push({
        id: 'knot-' + i, shape: 'knot', axes: 'xy', x: p.x, y: p.y,
        aria: 'Knot ' + (i + 1) + ': ' + fmt(p.x, 3) + ' ' + xu + ', ' + impactTick(p.y, u),
        apply: (c, x, y) => {
          const pts = c.tab.points;
          const lo = i > 0 ? num(pts[i - 1].x) + xSnap : -Infinity;
          const hi = i < pts.length - 1 ? num(pts[i + 1].x) - xSnap : Infinity;
          pts[i].x = fx(Math.min(hi, Math.max(lo, inX(x))));
          pts[i].y = fy(y);
        },
      }),
    );
  }

  if (model.kind === 'binned') {
    const e = model.bin_edges;
    const v = model.values;
    v.forEach((val, i) =>
      handles.push({
        id: 'bin-' + i, shape: 'bar', axes: 'y', x: (e[i] + e[i + 1]) / 2, y: val,
        aria: 'Bin ' + (i + 1) + ' value ' + impactTick(val, u),
        apply: (c, _x, y) => { c.bin.values[i] = fy(y); },
      }),
    );
    // Interior edges only; the outer edges stay editable in the list.
    e.forEach((ed, i) => {
      if (i === 0 || i === e.length - 1) return;
      handles.push({
        id: 'edge-' + i, shape: 'edge', axes: 'x', x: ed, y: (v[i - 1] + v[i]) / 2,
        aria: 'Bin edge ' + (i + 1) + ' at ' + fmt(ed, 3) + ' ' + xu,
        apply: (c, x) => {
          const lo = num(c.bin.edges[i - 1]) + xSnap;
          const hi = num(c.bin.edges[i + 1]) - xSnap;
          c.bin.edges[i] = fx(Math.min(hi, Math.max(lo, inX(x))));
        },
      });
    });
  }

  if (model.kind === 'sigmoid') {
    const g = model;
    const k = g.steepness;
    const top = g.offset + g.amplitude;
    const rising = k >= 0;
    handles.push({
      id: 'sig-mid', shape: 'param', axes: 'x', x: g.midpoint, y: fRaw(g.midpoint), label: 'midpoint',
      aria: 'Sigmoid midpoint ' + fmt(g.midpoint, 3) + ' ' + xu,
      apply: (c, x) => { c.sig.midpoint = fx(inX(x)); },
    });
    if (k !== 0) {
      // The steepness handle sits where k · (x − midpoint) = 2.
      const xs2 = g.midpoint + 2 / k;
      if (xs2 >= xmin && xs2 <= xmax) {
        handles.push({
          id: 'sig-steep', shape: 'knot', axes: 'x', x: xs2, y: fRaw(xs2), label: 'steepness',
          aria: 'Sigmoid steepness ' + fmt(k, 4),
          apply: (c, x) => {
            const d = inX(x) - num(c.sig.midpoint);
            if (Math.abs(d) >= xSnap) c.sig.steepness = plain(round6(2 / d));
          },
        });
      }
    }
    const xTopSide = rising ? xmax - span * 0.04 : xmin + span * 0.04;
    const xBaseSide = rising ? xmin + span * 0.04 : xmax - span * 0.04;
    handles.push({
      id: 'sig-top', shape: 'bar', axes: 'y', x: xTopSide, y: top, label: 'top',
      aria: 'Sigmoid top level ' + impactTick(top, u),
      apply: (c, _x, y) => { c.sig.amplitude = fy(Math.max(0, snapY(y) - num(c.sig.offset))); },
    });
    handles.push({
      id: 'sig-base', shape: 'bar', axes: 'y', x: xBaseSide, y: g.offset, label: 'base',
      aria: 'Sigmoid base level ' + impactTick(g.offset, u),
      apply: (c, _x, y) => {
        const t = num(c.sig.offset) + num(c.sig.amplitude);
        const off = Math.min(snapY(y), t);
        c.sig.offset = fy(off);
        c.sig.amplitude = fy(Math.max(0, t - off));
      },
    });
    if (g.zero_below !== null && g.zero_below >= xmin && g.zero_below <= xmax) {
      guides.push(Math.round(view.xp(g.zero_below) * 100) / 100);
      handles.push({
        id: 'sig-zb', shape: 'edge', axes: 'x', x: g.zero_below, y: 0, label: 'zero below',
        aria: 'Zero below ' + fmt(g.zero_below, 3) + ' ' + xu,
        apply: (c, x) => { c.sig.zero_below = fx(inX(x)); },
      });
    }
  }

  if (model.kind === 'linear') {
    const xa = xmin + span * 0.2;
    const xb = xmin + span * 0.8;
    const lineAt = (c: DesignerState, x: number) => num(c.lin.slope) * x + num(c.lin.intercept);
    const setLine = (c: DesignerState, x1: number, y1: number, x2: number, y2: number) => {
      const sl = (y2 - y1) / (x2 - x1);
      c.lin.slope = plain(round6(sl));
      c.lin.intercept = fy(y1 - sl * x1);
    };
    handles.push({
      id: 'lin-a', shape: 'knot', axes: 'y', x: xa, y: fRaw(xa), aria: 'Line point at ' + fmt(xa, 3) + ' ' + xu,
      apply: (c, _x, y) => setLine(c, xa, snapY(y), xb, lineAt(c, xb)),
    });
    handles.push({
      id: 'lin-b', shape: 'knot', axes: 'y', x: xb, y: fRaw(xb), aria: 'Line point at ' + fmt(xb, 3) + ' ' + xu,
      apply: (c, _x, y) => setLine(c, xa, lineAt(c, xa), xb, snapY(y)),
    });
  }

  if (clamp) {
    (['minimum', 'maximum'] as const).forEach((kk) => {
      const at = clamp[kk];
      if (at === null) return;
      handles.push({
        id: 'clamp-' + kk, shape: 'clamp', axes: 'y', x: xmin + span * 0.03, y: at,
        aria: 'Clamp ' + kk + ' ' + impactTick(at, u),
        apply: (c, _x, y) => {
          const other = num(c.clamp[kk === 'minimum' ? 'maximum' : 'minimum']);
          let v = snapY(y);
          if (Number.isFinite(other)) v = kk === 'minimum' ? Math.min(v, other) : Math.max(v, other);
          c.clamp[kk] = fy(v);
        },
      });
    });
  }

  return { handles, guides, xSnap };
}
