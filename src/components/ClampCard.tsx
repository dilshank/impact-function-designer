import { fmtImpactNum, impactFmt } from '../domain/presets';
import type { DesignerState } from '../domain/state';
import { Param } from './ModelCard';
import { SecHead, type Errs, type FieldCtx, type Update } from './common';

export function ClampCard({ s, update, errs, ctx }: { s: DesignerState; update: Update; errs: Errs; ctx: FieldCtx }) {
  // A min > max error belongs to both fields.
  const clampErrs: Errs = { ...errs, has: (p) => errs.has(p) || errs.has('/clamp') };

  return (
    <section className="card">
      <SecHead title="Final clamp" />
      <div className="grid-2">
        <Param id="c-min" label="Minimum" sdk="clamp.minimum" kind="impact" optional value={s.clamp.minimum} path="/clamp/minimum"
          set={(d, v) => { d.clamp.minimum = v; }} update={update} errs={clampErrs} ctx={ctx} />
        <Param id="c-max" label="Maximum" sdk="clamp.maximum" kind="impact" optional value={s.clamp.maximum} path="/clamp/maximum"
          set={(d, v) => { d.clamp.maximum = v; }} update={update} errs={clampErrs} ctx={ctx} />
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => update((d) => {
          const nu = impactFmt(d.cal);
          d.clamp.minimum = fmtImpactNum(0, nu);
          d.clamp.maximum = fmtImpactNum(nu.unit === '%' ? 100 : 1, nu);
        })}>
          0 to 1
        </button>
        <button type="button" className="btn" onClick={() => update((d) => { d.clamp.minimum = ''; d.clamp.maximum = ''; })}>No clamp</button>
      </div>
    </section>
  );
}
