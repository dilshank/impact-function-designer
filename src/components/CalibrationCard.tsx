import { HAZARDS, IMPACTS, type HazardId, type ImpactId } from '../domain/presets';
import { applyHazardPreset, applyImpactPreset, type DesignerState } from '../domain/state';
import { EXPOSURE_UNITS, impactUnitsFor, type UnitOption } from '../domain/units';
import { SecHead, Sdk, type Errs, type Update } from './common';

type CalKey = 'exposure_variable' | 'exposure_unit' | 'impact_metric' | 'impact_unit';

export function CalibrationCard({ s, update, errs }: { s: DesignerState; update: Update; errs: Errs }) {
  const setCal = (k: CalKey) => (v: string) => update((c) => { c.cal[k] = v; });
  const unit = (id: string, k: 'exposure_unit' | 'impact_unit', label: string, options: UnitOption[]) => (
    <div className="fld">
      <label htmlFor={id}>{label} <Sdk>{k}</Sdk></label>
      <UnitSelect id={id} value={s.cal[k]} options={options} onChange={setCal(k)} border={errs.border('/calibration/' + k)} />
    </div>
  );
  const text = (id: string, k: CalKey, label: string, placeholder?: string) => (
    <div className="fld">
      <label htmlFor={id}>{label} <Sdk>{k}</Sdk></label>
      <input
        id={id}
        className="inp"
        type="text"
        placeholder={placeholder}
        value={s.cal[k]}
        onChange={(e) => setCal(k)(e.target.value)}
        style={{ borderColor: errs.border('/calibration/' + k) }}
      />
    </div>
  );

  return (
    <section className="card">
      <SecHead title="Calibration" />
      <div className="halves">
        <div className="stack-12">
          <h3 className="sub-h">Exposure</h3>
          <div className="grid-2">
            <div className="fld span-all">
              <label htmlFor="hz">Hazard preset</label>
              <select id="hz" className="inp txt" value={s.cal.preset} onChange={(e) => update((c) => applyHazardPreset(c, e.target.value as HazardId))}>
                {Object.entries(HAZARDS).map(([id, h]) => <option key={id} value={id}>{h.label}</option>)}
              </select>
            </div>
            {text('c-ev', 'exposure_variable', 'Exposure variable')}
            {unit('c-eu', 'exposure_unit', 'Exposure unit', EXPOSURE_UNITS)}
            <div className="fld">
              <label htmlFor="x-min">Plot from ({s.cal.exposure_unit})</label>
              <input id="x-min" className="inp" type="text" inputMode="decimal" value={s.xMin} onChange={(e) => { const v = e.target.value; update((c) => { c.xMin = v; }); }} />
            </div>
            <div className="fld">
              <label htmlFor="x-max">Plot to ({s.cal.exposure_unit})</label>
              <input id="x-max" className="inp" type="text" inputMode="decimal" value={s.xMax} onChange={(e) => { const v = e.target.value; update((c) => { c.xMax = v; }); }} />
            </div>
          </div>
        </div>
        <div className="stack-12">
          <h3 className="sub-h">Impact</h3>
          <div className="grid-2">
            <div className="fld span-all">
              <label htmlFor="ip">Impact preset</label>
              <select id="ip" className="inp txt" value={s.cal.impactPreset} onChange={(e) => update((c) => applyImpactPreset(c, e.target.value as ImpactId))}>
                {Object.entries(IMPACTS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
              </select>
            </div>
            {text('c-im', 'impact_metric', 'Impact metric')}
            {unit('c-iu', 'impact_unit', 'Impact unit', impactUnitsFor(s.cal.impactPreset))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Standard units grouped by kind. A value outside the list (from an import) stays visible, flagged. */
function UnitSelect({ id, value, options, onChange, border }: { id: string; value: string; options: UnitOption[]; onChange: (v: string) => void; border: string }) {
  const groups = [...new Set(options.map((o) => o.group))];
  const known = options.some((o) => o.token === value);
  return (
    <select id={id} className="inp" value={value} onChange={(e) => onChange(e.target.value)} style={{ borderColor: border }}>
      {!known && <option value={value}>{(value || '(empty)') + ' — not standard'}</option>}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options.filter((o) => o.group === g).map((o) => (
            <option key={o.token} value={o.token}>{o.token === o.label ? o.token : o.token + ' — ' + o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
