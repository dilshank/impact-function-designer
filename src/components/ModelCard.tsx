import type { Interpolation, Kind, OriginAdjustment, OutsideDomain } from '../domain/evaluate';
import { num, plain } from '../domain/numbers';
import type { DesignerState } from '../domain/state';
import { ACCENT, BORDER, NumField, PlusIcon, SecHead, Sdk, XIcon, type Errs, type FieldCtx, type FieldKind, type Update } from './common';

const KINDS: { id: Kind; label: string; tag: string; glyph: string }[] = [
  { id: 'tabulated', label: 'Tabulated', tag: 'points', glyph: 'M2 18 L10 16 L18 9 L28 5 L38 4' },
  { id: 'binned', label: 'Binned', tag: 'bin_edges + values', glyph: 'M2 18 L12 18 L12 12 L22 12 L22 6 L38 6' },
  { id: 'sigmoid', label: 'Sigmoid', tag: 'logistic', glyph: 'M2 18 C14 18 14 2 26 2 L38 2' },
  { id: 'linear', label: 'Linear', tag: 'slope + intercept', glyph: 'M2 18 L38 3' },
];

function formula(s: DesignerState): string {
  switch (s.kind) {
    case 'linear':
      return 'raw(x) = slope · x + intercept';
    case 'sigmoid':
      return 'raw(x) = offset + amplitude · (L(steepness · (x − midpoint))' + (s.sig.origin === 'subtract_at_zero' ? ' − L(−steepness · midpoint)' : '') + '); 0 when x < zero_below';
    case 'tabulated':
      return {
        linear: 'linear interpolation between knots; y_i at x_i',
        step_left: 'step: y_i on [x_i, x_(i+1)); y_i at x_i',
        step_right: 'step: y_(i+1) on (x_i, x_(i+1)]; y_i at x_i',
      }[s.tab.interpolation];
    case 'binned':
      return 'value_i on [edge_i, edge_(i+1)); last bin includes the final edge';
  }
}

interface Props {
  s: DesignerState;
  update: Update;
  errs: Errs;
  ctx: FieldCtx;
}

export function ModelCard({ s, update, errs, ctx }: Props) {
  const impactLabel = s.cal.impact_unit || '—';
  const newStep = Math.max(ctx.span / 10, 0.001);

  return (
    <section className="card">
      <SecHead title="Model" />
      <div role="group" aria-label="Model kind" className="grid-2" style={{ gap: 6 }}>
        {KINDS.map((k) => {
          const on = s.kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              className="kind-btn"
              aria-pressed={on}
              onClick={() => update((c) => { c.kind = k.id; })}
              style={{ borderColor: on ? ACCENT : BORDER, background: on ? '#EEF2FF' : '#FFFFFF' }}
            >
              <svg aria-hidden="true" width="36" height="20" viewBox="0 0 40 20" fill="none" className="kind-glyph" style={{ stroke: on ? ACCENT : '#6B7280' }}>
                <path d={k.glyph} />
              </svg>
              <span className="kind-text">
                <span className="kind-label">{k.label}</span>
                <span className="kind-tag">{k.tag}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="formula">{formula(s)}</div>

      {s.kind === 'tabulated' && (
        <div className="stack-10">
          <div className="grid-2">
            <div className="fld">
              <label htmlFor="t-int">Between knots <Sdk>interpolation</Sdk></label>
              <select id="t-int" className="inp txt" value={s.tab.interpolation} onChange={(e) => { const v = e.target.value as Interpolation; update((c) => { c.tab.interpolation = v; }); }}>
                <option value="linear">Linear</option>
                <option value="step_left">Step, hold left</option>
                <option value="step_right">Step, take right</option>
              </select>
            </div>
            <OutsideSelect id="t-out" value={s.tab.outside} clampLabel="Hold end values" onChange={(v) => update((c) => { c.tab.outside = v; })} />
          </div>
          <div className="rows-head knots">
            <span>#</span><span>x ({s.cal.exposure_unit})</span><span>y ({impactLabel})</span><span />
          </div>
          {s.tab.points.map((p, i) => (
            <div key={i} className="row knots">
              <span className="row-n">{i + 1}</span>
              <NumField kind="exposure" ctx={ctx} aria={'Knot ' + (i + 1) + ' x'} invalid={errs.has('/model/points/' + i + '/x')}
                value={p.x} onChange={(v) => update((c) => { c.tab.points[i].x = v; })} />
              <NumField kind="impact" ctx={ctx} aria={'Knot ' + (i + 1) + ' y'} invalid={errs.has('/model/points/' + i + '/y')}
                value={p.y} onChange={(v) => update((c) => { c.tab.points[i].y = v; })} />
              <button type="button" className="btn icon-btn" aria-label={'Remove knot ' + (i + 1)} disabled={s.tab.points.length <= 2}
                onClick={() => update((c) => { c.tab.points.splice(i, 1); })}>
                <XIcon />
              </button>
            </div>
          ))}
          <button type="button" className="btn self-start" onClick={() => update((c) => {
            const pts = c.tab.points;
            const last = pts[pts.length - 1];
            const lx = num(last && last.x);
            pts.push({ x: Number.isFinite(lx) ? plain(lx + newStep) : '', y: last ? last.y : '' });
          })}>
            <PlusIcon /> Add knot
          </button>
        </div>
      )}

      {s.kind === 'binned' && (
        <div className="stack-10">
          <OutsideSelect id="b-out" value={s.bin.outside} clampLabel="Use the nearest bin" onChange={(v) => update((c) => { c.bin.outside = v; })} />
          <div className="rows-head bins">
            <span>From ({s.cal.exposure_unit})</span><span>Value ({impactLabel})</span><span />
          </div>
          {s.bin.values.map((val, i) => (
            <div key={i} className="row bins">
              <NumField kind="exposure" ctx={ctx} aria={'Bin ' + (i + 1) + ' lower edge'} invalid={errs.has('/model/bin_edges/' + i)}
                value={s.bin.edges[i] ?? ''} onChange={(v) => update((c) => { c.bin.edges[i] = v; })} />
              <NumField kind="impact" ctx={ctx} aria={'Bin ' + (i + 1) + ' value'} invalid={errs.has('/model/values/' + i)}
                value={val} onChange={(v) => update((c) => { c.bin.values[i] = v; })} />
              <button type="button" className="btn icon-btn" aria-label={'Remove bin ' + (i + 1)} disabled={s.bin.values.length <= 1}
                onClick={() => update((c) => {
                  c.bin.values.splice(i, 1);
                  // Removing the last bin drops its upper edge; any other bin drops its lower edge.
                  c.bin.edges.splice(i === c.bin.edges.length - 2 ? i + 1 : i, 1);
                })}>
                <XIcon />
              </button>
            </div>
          ))}
          <div className="row bins">
            <NumField kind="exposure" ctx={ctx} aria="Final bin edge" invalid={errs.has('/model/bin_edges/' + s.bin.values.length)}
              value={s.bin.edges[s.bin.edges.length - 1] ?? ''} onChange={(v) => update((c) => { c.bin.edges[c.bin.edges.length - 1] = v; })} />
            <span className="row-note">Final edge, included in the last bin</span>
            <span />
          </div>
          <button type="button" className="btn self-start" onClick={() => update((c) => {
            const e = c.bin.edges;
            const lx = num(e[e.length - 1]);
            e.push(Number.isFinite(lx) ? plain(lx + newStep) : '');
            c.bin.values.push(c.bin.values[c.bin.values.length - 1] ?? '');
          })}>
            <PlusIcon /> Add bin
          </button>
        </div>
      )}

      {s.kind === 'sigmoid' && (
        <>
          <div className="grid-2">
            <Param id="p-mid" label="Midpoint" sdk="midpoint" kind="exposure" value={s.sig.midpoint} path="/model/midpoint" set={(c, v) => { c.sig.midpoint = v; }} {...{ update, errs, ctx }} />
            <Param id="p-st" label="Steepness" sdk="steepness" kind="rate" step={0.01} value={s.sig.steepness} path="/model/steepness" set={(c, v) => { c.sig.steepness = v; }} {...{ update, errs, ctx }} />
            <Param id="p-off" label="Lower level" sdk="offset" kind="impact" value={s.sig.offset} path="/model/offset" set={(c, v) => { c.sig.offset = v; }} {...{ update, errs, ctx }} />
            <Param id="p-amp" label="Height" sdk="amplitude ≥ 0" kind="impact" value={s.sig.amplitude} path="/model/amplitude" set={(c, v) => { c.sig.amplitude = v; }} {...{ update, errs, ctx }} />
            <Param id="p-zb" label="Zero below" sdk="zero_below, strict" kind="exposure" optional wide value={s.sig.zero_below} path="/model/zero_below" set={(c, v) => { c.sig.zero_below = v; }} {...{ update, errs, ctx }} />
          </div>
          <div className="fld">
            <label htmlFor="s-oa">At zero exposure <Sdk>origin_adjustment</Sdk></label>
            <select id="s-oa" className="inp txt" value={s.sig.origin} onChange={(e) => { const v = e.target.value as OriginAdjustment; update((c) => { c.sig.origin = v; }); }}>
              <option value="none">No adjustment</option>
              <option value="subtract_at_zero">Subtract the curve's value at x = 0</option>
            </select>
          </div>
        </>
      )}

      {s.kind === 'linear' && (
        <div className="grid-2">
          <Param id="p-sl" label="Slope" sdk="slope" kind="rate" step={0.001} value={s.lin.slope} path="/model/slope" set={(c, v) => { c.lin.slope = v; }} {...{ update, errs, ctx }} />
          <Param id="p-ic" label="Intercept" sdk="intercept" kind="impact" value={s.lin.intercept} path="/model/intercept" set={(c, v) => { c.lin.intercept = v; }} {...{ update, errs, ctx }} />
        </div>
      )}
    </section>
  );
}

function OutsideSelect({ id, value, clampLabel, onChange }: { id: string; value: OutsideDomain; clampLabel: string; onChange: (v: OutsideDomain) => void }) {
  return (
    <div className="fld">
      <label htmlFor={id}>{id === 'b-out' ? 'Outside the bins' : 'Outside the table'} <Sdk>outside_domain</Sdk></label>
      <select id={id} className="inp txt" value={value} onChange={(e) => onChange(e.target.value as OutsideDomain)}>
        <option value="clamp">{clampLabel}</option>
        <option value="error">Reject (error)</option>
      </select>
    </div>
  );
}

interface ParamProps {
  id: string;
  label: string;
  sdk: string;
  kind: FieldKind;
  value: string;
  path: string;
  set: (c: DesignerState, v: string) => void;
  update: Update;
  errs: Errs;
  ctx: FieldCtx;
  optional?: boolean;
  wide?: boolean;
  step?: number;
}

/** A labelled coefficient field for the parametric kernels. */
export function Param({ id, label, sdk, kind, value, path, set, update, errs, ctx, optional, wide, step }: ParamProps) {
  return (
    <div className={'fld' + (wide ? ' span-all' : '')}>
      <label htmlFor={id}>{label} <Sdk>{sdk}</Sdk></label>
      <NumField id={id} kind={kind} ctx={ctx} step={step} optional={optional} invalid={errs.has(path)} value={value} onChange={(v) => update((c) => set(c, v))} />
    </div>
  );
}
