// The four export views: definition JSON, canonical form, crc_framework Python and CSV.
import { canon, definitionHash, pretty } from './canonical';
import type { ImpactDefinition, ValidationError } from './definition';
import { round6 } from './numbers';
import type { PlotView } from './plot';
import type { DesignerState, ExportTab } from './state';

export interface ExportView {
  hash: string | null;
  text: string;
  note: string;
}

/** Python using the crc_framework 0.4.1 classes, or '' when none executes the definition exactly. */
export function pythonExport(def: ImpactDefinition, hash: string): { python: string; note: string } {
  const m = def.model;
  const py = (v: number | null) => (v === null ? 'None' : Number.isInteger(v) ? v.toFixed(1) : String(v));
  const cal = def.calibration;
  const cl = def.clamp;
  const head = 'from crc_framework import ';
  const tail =
    '\n\nimpact_result = request.impact(\n    DAMAGE_FN,\n    name=' + JSON.stringify(cal.exposure_variable + '_' + cal.impact_metric) +
    ',\n    value_unit=' + JSON.stringify(cal.impact_unit) + ',\n    value_semantics=' + JSON.stringify(cal.impact_metric) + ',\n)';
  const cmt = '# definition_hash ' + hash + '\n# ' + cal.exposure_variable + ' [' + cal.exposure_unit + '] -> ' + cal.impact_metric + ' [' + cal.impact_unit + ']\n';

  if (m.kind === 'linear') {
    return {
      python: head + 'LinearImpact\n\n' + cmt + 'DAMAGE_FN = LinearImpact(\n    slope=' + py(m.slope) + ',\n    intercept=' + py(m.intercept) +
        ',\n    minimum=' + py(cl ? cl.minimum : null) + ',\n    maximum=' + py(cl ? cl.maximum : null) + ',\n)' + tail,
      note: '',
    };
  }
  if (m.kind === 'sigmoid' && m.origin_adjustment === 'none' && !cl) {
    return {
      python: head + 'SigmoidImpact\n\n' + cmt + 'DAMAGE_FN = SigmoidImpact(\n    midpoint=' + py(m.midpoint) + ',\n    steepness=' + py(m.steepness) +
        ',\n    minimum=' + py(m.offset) + ',\n    maximum=' + py(m.offset + m.amplitude) + ',\n    zero_below=' + py(m.zero_below) + ',\n)' + tail,
      note: '',
    };
  }
  // PiecewiseLinearImpact holds end values and needs rising knots that the clamp never cuts.
  if (
    m.kind === 'tabulated' && m.interpolation === 'linear' && m.outside_domain === 'clamp' &&
    m.points.every((p, i) => i === 0 || p.y >= m.points[i - 1].y) &&
    (!cl || m.points.every((p) => (cl.minimum === null || p.y >= cl.minimum) && (cl.maximum === null || p.y <= cl.maximum)))
  ) {
    return {
      python: head + 'PiecewiseLinearImpact\n\n' + cmt + 'DAMAGE_FN = PiecewiseLinearImpact(\n    exposure=[' + m.points.map((p) => py(p.x)).join(', ') +
        '],\n    impact=[' + m.points.map((p) => py(p.y)).join(', ') + '],\n)' + tail,
      note: '',
    };
  }
  const why = m.kind === 'binned' ? 'binned models' : m.kind === 'sigmoid' ? 'sigmoid with a clamp or subtract_at_zero' : 'step interpolation, error outside the domain, falling knots or a binding clamp';
  return { python: '', note: '# No crc_framework 0.4.1 class executes this definition exactly yet\n# (' + why + ').\n# Use the JSON definition.' };
}

export function csvExport(s: DesignerState, def: ImpactDefinition, view: PlotView): string {
  if (!view.model) return '';
  const m = def.model;
  const head = 'x_' + (s.cal.exposure_unit || '').replace(/[^A-Za-z0-9]+/g, '_') + ',y_' + String(s.cal.impact_unit || '').replace(/[^A-Za-z0-9%]+/g, '_');
  if (m.kind === 'tabulated') return head + '\n' + m.points.map((p) => p.x + ',' + p.y).join('\n');
  if (m.kind === 'binned') return 'lower_edge,upper_edge,value\n' + m.values.map((v, i) => m.bin_edges[i] + ',' + m.bin_edges[i + 1] + ',' + v).join('\n');
  const rows: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = view.xmin + (view.span * i) / 10;
    rows.push(round6(x) + ',' + round6(view.fFinal(x)));
  }
  return head + '\n' + rows.join('\n');
}

export function buildExport(tab: ExportTab, s: DesignerState, def: ImpactDefinition, errors: ValidationError[], view: PlotView): ExportView {
  if (errors.length) {
    // Show what was parsed so far, with unparsed numbers as null.
    const safe = JSON.parse(JSON.stringify(def, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)));
    return { hash: null, text: pretty(safe), note: 'Fix the items above; the definition, its canonical form and hash appear once it validates.' };
  }
  const hash = definitionHash(def);
  switch (tab) {
    case 'canonical':
      return {
        hash, text: canon(def),
        note: 'crc-canonical-json/1: sorted keys, shortest round-trip binary64 numbers. definition_hash is the SHA-256 of these UTF-8 bytes and is never embedded in the definition.',
      };
    case 'python': {
      const { python, note } = pythonExport(def, hash);
      return {
        hash, text: python || note,
        note: python ? 'Executable today with the crc_framework classes; the JSON definition remains the source of truth.' : 'The contract is ahead of the executable classes for this model.',
      };
    }
    case 'csv':
      return {
        hash, text: csvExport(s, def, view),
        note: def.model.kind === 'tabulated' ? 'Knots as authored.' : def.model.kind === 'binned' ? 'One row per bin.' : 'Final response sampled at 11 points across the plot range.',
      };
    default:
      return { hash, text: pretty(def), note: 'impact_definition 1.0 with every default materialized. Holds no exposure data, output name or spatial settings.' };
  }
}
