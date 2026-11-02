import { useEffect, useState } from 'react';
import type { ValidationError } from '../domain/definition';
import type { ExportView } from '../domain/exports';
import type { ExportTab } from '../domain/state';
import type { Update } from './common';

const TABS: [ExportTab, string][] = [['definition', 'Definition JSON'], ['canonical', 'Canonical'], ['python', 'Python'], ['csv', 'CSV']];

export function ExportPanel({ tab, update, view, errors }: { tab: ExportTab; update: Update; view: ExportView; errors: ValidationError[] }) {
  const [copied, setCopied] = useState(false);
  // Any change to what would be copied resets the label.
  useEffect(() => setCopied(false), [view.text]);

  const copy = () => {
    try {
      navigator.clipboard.writeText(view.text).then(() => setCopied(true), () => {});
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="export" id="export">
      <div className="export-head">
        <div className="export-title">
          <h2 className="sec-h" style={{ color: '#FFFFFF' }}>Export</h2>
          <div role="tablist" aria-label="Export format" className="export-tabs">
            {TABS.map(([id, label]) => {
              const on = tab === id;
              return (
                <button key={id} type="button" role="tab" aria-selected={on} className="export-tab" onClick={() => update((c) => { c.exportTab = id; })}
                  style={on ? { background: '#E7E9EC', color: '#14181F', borderColor: '#E7E9EC' } : { background: 'transparent', color: '#E7E9EC', borderColor: '#3A414D' }}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="copy-btn" onClick={copy}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="hash-row">
        <span style={{ color: '#A9AFB9' }}>definition_hash</span>
        <span style={{ color: view.hash ? '#86EFAC' : '#FCA5A5', overflowWrap: 'anywhere' }}>{view.hash ?? 'not available while the definition is invalid'}</span>
      </div>
      {errors.length > 0 && (
        <ul className="error-list">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="err-code">{e.code}</span> <span className="err-path">{e.path}</span> — {e.msg}
            </li>
          ))}
        </ul>
      )}
      <div className="export-body">
        <pre>{view.text}</pre>
      </div>
    </section>
  );
}
