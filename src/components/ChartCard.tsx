import { Fragment, type KeyboardEvent, type PointerEvent } from 'react';
import { buildHandles, EDIT_HINTS, type HandleShape, type HandleSpec } from '../domain/handles';
import { fmt, round6 } from '../domain/numbers';
import { r2, type Frame, type PlotView } from '../domain/plot';
import { impactTick, type ImpactFormat } from '../domain/presets';
import type { DesignerState } from '../domain/state';
import { ACCENT, BORDER, type Update } from './common';

export interface Drag {
  id: string;
  box: DOMRect;
  frame: Frame;
}

const SHAPES: Record<HandleShape, { w: number; h: number; r: string; bg: string; bc: string }> = {
  knot: { w: 14, h: 14, r: '50%', bg: '#FFFFFF', bc: ACCENT },
  bar: { w: 30, h: 10, r: '5px', bg: ACCENT, bc: '#FFFFFF' },
  edge: { w: 10, h: 30, r: '5px', bg: '#FFFFFF', bc: ACCENT },
  param: { w: 14, h: 14, r: '3px', bg: ACCENT, bc: '#FFFFFF' },
  clamp: { w: 26, h: 10, r: '5px', bg: '#6B7280', bc: '#FFFFFF' },
};

interface Props {
  s: DesignerState;
  update: Update;
  view: PlotView;
  u: ImpactFormat;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
}

export function ChartCard({ s, update, view, u, drag, setDrag }: Props) {
  const xu = s.cal.exposure_unit || '';
  const metricLabel = String(s.cal.impact_metric || 'impact').replace(/_/g, ' ');
  const variable = s.cal.exposure_variable || 'exposure';
  const iu = s.cal.impact_unit || '—';
  const { xp, yp } = view;

  const editOn = s.editOn !== false && !!view.model;
  const { handles, guides, xSnap } = editOn ? buildHandles(view, u, xu) : { handles: [], guides: [], xSnap: 0 };
  const knotDots = !editOn && view.model?.kind === 'tabulated'
    ? view.model.points.map((p) => ({ xp: r2(xp(p.x)), yp: r2(yp(view.fFinal(p.x))) }))
    : [];

  const commit = (h: HandleSpec, x: number, y: number) =>
    update((c) => h.apply(c, h.axes === 'y' ? h.x : x, h.axes === 'x' ? h.y : y));

  const onDown = (h: HandleSpec) => (e: PointerEvent<HTMLButtonElement>) => {
    const plot = e.currentTarget.closest('[data-plot]');
    if (!plot) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    setDrag({ id: h.id, box: plot.getBoundingClientRect(), frame: { xmin: view.xmin, xmax: view.xmax, yMin: view.yMin, yHi: view.yHi } });
  };
  const onMove = (h: HandleSpec) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.id !== h.id) return;
    const { box: b, frame: f } = drag;
    const tx = (e.clientX - b.left) / b.width;
    const ty = 1 - (e.clientY - b.top) / b.height;
    commit(h, f.xmin + tx * (f.xmax - f.xmin), f.yMin + ty * (f.yHi - f.yMin));
  };
  const onUp = (h: HandleSpec) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.id !== h.id) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    setDrag(null);
  };
  const onKey = (h: HandleSpec) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    const dx = (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0) * (h.axes === 'y' ? 0 : xSnap);
    const dy = (k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0) * (h.axes === 'x' ? 0 : u.step);
    if (!dx && !dy) return;
    e.preventDefault();
    const mult = e.shiftKey ? 10 : 1;
    commit(h, h.x + dx * mult, h.y + dy * mult);
  };

  // Probe
  const px = Math.min(Math.max(view.xmin, Number.isFinite(Number(s.probe)) ? Number(s.probe) : view.xmin), view.xmax);
  const pyv = view.fFinal(px);
  const probeOk = Number.isFinite(pyv);
  const readout = fmt(px, 3) + ' ' + xu + ' → ' + (probeOk
    ? impactTick(pyv, u)
    : !view.model ? 'model incomplete'
    : Number.isNaN(view.fRaw(px)) && view.errorZones.length ? 'out_of_domain'
    : 'non_finite_result');

  const pad = u.currency ? { padL: 96, titleGap: 66 } : { padL: 84, titleGap: 54 };

  return (
    <section className="card" style={{ gap: 12 }}>
      <div className="chart-head">
        <h2 className="sec-h">{variable} ({xu}) → {metricLabel} ({iu})</h2>
        <div className="chart-chips">
          <span className="chip">{s.kind}</span>
          <span className="chip" title="Monotonicity of the full function, including thresholds and clamp">{view.mono.replace(/_/g, '-')}</span>
          <button
            type="button"
            className="btn edit-btn"
            aria-pressed={editOn}
            title={view.model ? EDIT_HINTS[s.kind] + (view.clamp ? ' Grey bars on the left move the clamp.' : '') : undefined}
            onClick={() => update((c) => { c.editOn = c.editOn === false; })}
            style={editOn ? { background: '#EEF2FF', color: '#14181F', borderColor: ACCENT } : { background: '#FFFFFF', color: '#4A5160', borderColor: BORDER }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
            </svg>
            Edit on chart
          </button>
        </div>
      </div>

      <div role="img" aria-label={s.kind + ' impact function of ' + variable + ' against ' + metricLabel} className="chart-outer" style={{ paddingLeft: pad.padL }}>
        <div data-plot="1" className="plot">
          {view.yTicks.map((t, i) => (
            <Fragment key={'yt' + i}>
              <div className="grid-h" style={{ bottom: t.pct + '%' }} />
              <div className="tick-y" style={{ bottom: t.pct + '%' }} />
              <div className="tick-y-label" style={{ bottom: t.pct + '%' }}>{t.label}</div>
            </Fragment>
          ))}
          {view.yMinor.map((t, i) => <div key={'ym' + i} className="tick-y-minor" style={{ bottom: t.pct + '%' }} />)}
          {view.xTicks.map((t, i) => (
            <Fragment key={'xt' + i}>
              <div className="grid-v" style={{ left: t.pct + '%' }} />
              <div className="tick-x" style={{ left: t.pct + '%' }} />
              <div className="tick-x-label" style={{ left: t.pct + '%' }}>{t.label}</div>
            </Fragment>
          ))}
          {view.xMinor.map((t, i) => <div key={'xm' + i} className="tick-x-minor" style={{ left: t.pct + '%' }} />)}
          {view.errorZones.map((z, i) => (
            <Fragment key={'ez' + i}>
              <div className="error-zone" style={{ left: z.left + '%', width: z.width + '%' }} />
              <div className="error-zone-label" style={{ left: `calc(${z.left}% + 6px)` }}>out_of_domain</div>
            </Fragment>
          ))}
          {view.clampLines.map((c, i) => (
            <Fragment key={'cl' + i}>
              <div className="clamp-line" style={{ bottom: c.pct + '%' }} />
              <div className="clamp-label" style={{ bottom: `calc(${c.pct}% + 3px)` }}>{c.label}</div>
            </Fragment>
          ))}
          {view.zeroX.show && <div className="zero-x" style={{ left: view.zeroX.pct + '%' }} />}

          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" className="curves">
            <path d={view.rawPath} className="raw-path" style={{ stroke: ACCENT }} />
            <path d={view.curvePath} className="curve-path" style={{ stroke: ACCENT }} />
          </svg>

          {probeOk && (
            <>
              <div className="probe-v" style={{ left: r2(xp(px)) + '%', height: r2(yp(pyv)) + '%' }} />
              <div className="probe-h" style={{ width: r2(xp(px)) + '%', bottom: r2(yp(pyv)) + '%' }} />
              <div className="probe-dot" style={{ left: r2(xp(px)) + '%', bottom: r2(yp(pyv)) + '%' }} />
            </>
          )}
          {knotDots.map((d, i) => <div key={'kd' + i} className="knot-dot" style={{ left: d.xp + '%', bottom: d.yp + '%', borderColor: ACCENT }} />)}
          {guides.map((g, i) => <div key={'gd' + i} className="guide" style={{ left: g + '%', borderColor: ACCENT }} />)}

          {handles.map((h) => {
            const sh = SHAPES[h.shape];
            const hx = r2(Math.min(100, Math.max(0, xp(h.x))));
            const hy = r2(Math.min(100, Math.max(0, yp(h.y))));
            const how = h.axes === 'xy' ? ' — drag, or use arrow keys' : h.axes === 'x' ? ' — drag sideways, or ← →' : ' — drag up or down, or ↑ ↓';
            return (
              <Fragment key={h.id}>
                <button
                  type="button"
                  className="handle"
                  aria-label={h.aria}
                  title={h.aria + how}
                  onPointerDown={onDown(h)}
                  onPointerMove={onMove(h)}
                  onPointerUp={onUp(h)}
                  onPointerCancel={onUp(h)}
                  onKeyDown={onKey(h)}
                  style={{
                    left: hx + '%', bottom: hy + '%', width: sh.w, height: sh.h, borderRadius: sh.r, background: sh.bg, borderColor: sh.bc,
                    cursor: h.axes === 'xy' ? 'move' : h.axes === 'x' ? 'ew-resize' : 'ns-resize',
                  }}
                />
                {h.label && (
                  <div
                    className="handle-label"
                    style={{
                      left: hx + '%', bottom: `calc(${hy}% + 12px)`, color: h.shape === 'clamp' ? '#4A5160' : ACCENT,
                      transform: `translateX(${hx > 85 ? '-100%' : hx < 10 ? '0%' : '-50%'})`,
                    }}
                  >
                    {h.label}
                  </div>
                )}
              </Fragment>
            );
          })}

          <div className="raw-note">{view.clampBinds ? 'Dashed: raw model before the final clamp' : ''}</div>
          <div className="x-title">{variable} ({xu})</div>
          <div className="y-title" style={{ right: `calc(100% + ${pad.titleGap}px)` }}>
            <span>{metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} ({iu})</span>
          </div>
        </div>
      </div>

      <div className="probe-row">
        <label htmlFor="probe">Evaluate at</label>
        <input
          id="probe"
          type="range"
          min={round6(view.xmin)}
          max={round6(view.xmax)}
          step={Math.max(0.0001, round6(view.span / 400))}
          value={px}
          onChange={(e) => { const v = Number(e.target.value); update((c) => { c.probe = v; }); }}
        />
        <output htmlFor="probe" style={{ color: probeOk ? '#B45309' : '#B91C1C' }}>{readout}</output>
      </div>
    </section>
  );
}
