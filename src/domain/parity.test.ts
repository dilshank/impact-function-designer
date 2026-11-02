// Runs the design mockup's own logic class next to the port and checks they agree,
// so the app stays faithful to design/damage-function-designer/Main.dc.html.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Kind } from './evaluate';
import { buildDefinition } from './definition';
import { buildExport } from './exports';
import { computePlot } from './plot';
import { HAZARDS, IMPACTS, impactFmt, type HazardId, type ImpactId } from './presets';
import { applyHazardPreset, applyImpactPreset, defaultState, type DesignerState, type ExportTab } from './state';

const html = readFileSync(fileURLToPath(new URL('../../design/damage-function-designer/Main.dc.html', import.meta.url)), 'utf8');
const script = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)![1];

class DCLogic {
  state: unknown = null;
  props: Record<string, unknown> = {};
  setState() {}
  forceUpdate() {}
}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const Mockup = new Function('DCLogic', script + '\nreturn Component;')(DCLogic);

function mockupView(s: DesignerState) {
  const m = new Mockup();
  m.state = { ...structuredClone(s), copied: false };
  return m.renderVals();
}

function portView(s: DesignerState) {
  const u = impactFmt(s.cal);
  const { definition, errors } = buildDefinition(s);
  const view = computePlot(s, definition, u, null);
  return { definition, errors, view, ex: buildExport(s.exportTab, s, definition, errors, view) };
}

const KINDS: Kind[] = ['tabulated', 'binned', 'sigmoid', 'linear'];
const TABS: ExportTab[] = ['definition', 'canonical', 'python', 'csv'];

describe('parity with the design mockup', () => {
  for (const hz of Object.keys(HAZARDS) as HazardId[]) {
    for (const ip of Object.keys(IMPACTS) as ImpactId[]) {
      it(`${hz} × ${ip}`, () => {
        const base = defaultState();
        applyImpactPreset(base, ip);
        applyHazardPreset(base, hz);
        for (const kind of KINDS) {
          for (const tab of TABS) {
            const s = { ...structuredClone(base), kind, exportTab: tab };
            const mock = mockupView(s);
            const port = portView(s);
            const where = `${kind}/${tab}`;
            expect(port.errors, where).toEqual(mock.errors);
            expect(port.ex.text, where).toBe(mock.exportText);
            expect(port.ex.note, where).toBe(mock.exportNote);
            expect(port.ex.hash ?? 'not available while the definition is invalid', where).toBe(mock.hashText);
            expect(port.view.curvePath, where).toBe(mock.curvePath);
            expect(port.view.rawPath, where).toBe(mock.rawPath);
            expect(port.view.mono.replace(/_/g, '-'), where).toBe(mock.mono);
            expect(port.view.yTicks, where).toEqual(mock.yTicks);
            expect(port.view.xTicks, where).toEqual(mock.xTicks);
          }
        }
      });
    }
  }

  it('matches on an invalid definition', () => {
    const s = defaultState();
    s.tab.points[1].y = 'abc';
    s.prov.origin = 'derived';
    s.prov.derived = 'sha256:nothex';
    const mock = mockupView(s);
    const port = portView(s);
    expect(port.errors).toEqual(mock.errors);
    expect(port.ex.text).toBe(mock.exportText);
  });

  it('matches the ratio → percent conversion', () => {
    const s = defaultState();
    applyImpactPreset(s, 'damage_percent');
    const m = new Mockup();
    m.state = { ...defaultState(), copied: false };
    let captured: DesignerState | null = null;
    m.setState = (next: DesignerState) => { captured = next; };
    m.renderVals().on.impactPreset({ target: { value: 'damage_percent' } });
    const { copied: _copied, ...rest } = captured as unknown as DesignerState & { copied: boolean };
    expect(rest).toEqual(s);
  });
});
