import { useCallback, useMemo, useState } from 'react';
import { CalibrationCard } from './components/CalibrationCard';
import { ChartCard, type Drag } from './components/ChartCard';
import { ClampCard } from './components/ClampCard';
import { BORDER, ERROR, type Errs, type FieldCtx, type Update } from './components/common';
import { ExportPanel } from './components/ExportPanel';
import { ImportDialog } from './components/ImportDialog';
import { ModelCard } from './components/ModelCard';
import { ProvenanceCard } from './components/ProvenanceCard';
import { buildDefinition } from './domain/definition';
import { buildExport } from './domain/exports';
import { importText } from './domain/importer';
import { computePlot } from './domain/plot';
import { impactFmt } from './domain/presets';
import { defaultState, type DesignerState } from './domain/state';

export function App() {
  const [s, setS] = useState<DesignerState>(defaultState);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<{ summary: string; source: string; warnings: string[]; previous: DesignerState } | null>(null);

  const runImport = (text: string, source: string) => {
    const r = importText(text, s);
    if (!r.ok) return r.errors;
    setNotice({ summary: r.summary, source, warnings: r.warnings, previous: s });
    setS(r.state);
    setImportOpen(false);
    return null;
  };

  const update: Update = useCallback((fn) => {
    setS((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const u = useMemo(() => impactFmt(s.cal), [s.cal]);
  const { definition, errors } = useMemo(() => buildDefinition(s), [s]);
  const errs = useMemo<Errs>(() => {
    const paths = new Set(errors.map((e) => e.path));
    return {
      has: (p) => paths.has(p),
      hasPrefix: (pre) => [...paths].some((p) => p.startsWith(pre)),
      border: (p) => (paths.has(p) ? ERROR : BORDER),
    };
  }, [errors]);
  const view = useMemo(() => computePlot(s, definition, u, drag?.frame ?? null), [s, definition, u, drag]);
  const exportView = useMemo(() => buildExport(s.exportTab, s, definition, errors, view), [s, definition, errors, view]);
  const ctx: FieldCtx = { u, xu: s.cal.exposure_unit || '', span: view.span };

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg width="22" height="14" viewBox="0 0 40 20" fill="none"><path d="M2 18 L10 16 L18 9 L28 5 L38 4" /></svg>
            </span>
            <h1>Impact Function Designer</h1>
            <a className="brand-meta" href="https://climateriskcommons.org/docs/" target="_blank" rel="noopener noreferrer" title="Climate Risk Commons documentation">crc-impact/1 · schema 1.0</a>
          </div>
          <div className="appbar-actions">
            <a href="#export" className={'status ' + (exportView.hash ? 'ok' : 'bad')} title={exportView.hash ?? 'See the issues in Export'}>
              <span className="status-dot" aria-hidden="true" />
              {exportView.hash ? 'Valid · ' + exportView.hash.slice(7, 15) : errors.length + (errors.length === 1 ? ' issue' : ' issues')}
            </a>
            <button type="button" className="btn" onClick={() => setImportOpen(true)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              Import
            </button>
          </div>
        </div>
      </header>
      <main className="page">
      <div className="page-inner">

        {notice && (
          <div className="notice" role="status">
            <div className="stack-6">
              <strong>{notice.summary}</strong>
              <span className="hint">From {notice.source}</span>
              {notice.warnings.length > 0 && (
                <ul className="notice-warnings">
                  {notice.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => { setS(notice.previous); setNotice(null); }}>Undo import</button>
              <button type="button" className="btn icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
            </div>
          </div>
        )}

        <CalibrationCard s={s} update={update} errs={errs} />

        <div className="two-col">
          <ModelCard s={s} update={update} errs={errs} ctx={ctx} />
          <ChartCard s={s} update={update} view={view} u={u} drag={drag} setDrag={setDrag} />
        </div>

        <div className="two-col">
          <ClampCard s={s} update={update} errs={errs} ctx={ctx} />
          <ProvenanceCard s={s} update={update} errs={errs} />
        </div>

        <ExportPanel tab={s.exportTab} update={update} view={exportView} errors={errors} />
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={runImport} />
      </div>
      </main>
    </div>
  );
}
