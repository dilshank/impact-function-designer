import type { DesignerState, Origin, SourceKind, SourceRow } from '../domain/state';
import { blank } from '../domain/numbers';
import { ACCENT, BORDER, ERROR, PlusIcon, SecHead, Sdk, XIcon, type Errs, type Update } from './common';

const ORIGINS: [Origin, string][] = [['user_defined', 'User-defined'], ['published', 'Published'], ['imported', 'Imported'], ['derived', 'Derived']];

const ORIGIN_HINTS: Record<Origin, string> = {
  user_defined: 'Coefficients you authored. Sources are optional evidence.',
  published: 'Coefficients taken from a cited source; pick which source record below.',
  imported: 'Coefficients produced by an importer from a cited source.',
  derived: 'Coefficients derived from parent definitions, referenced by their hashes.',
};

type ProvText = 'importer_name' | 'importer_version' | 'importer_sha' | 'description' | 'derived';

export function ProvenanceCard({ s, update, errs }: { s: DesignerState; update: Update; errs: Errs }) {
  const p = s.prov;
  const needsSource = p.origin === 'published' || p.origin === 'imported';
  const picks = p.sources.filter((x) => !blank(x.id));
  const setProv = (k: ProvText) => (v: string) => update((c) => { c.prov[k] = v; });

  const pickOrigin = (id: Origin) => update((c) => {
    c.prov.origin = id;
    if ((id === 'published' || id === 'imported') && !c.prov.source_id && c.prov.sources.length) c.prov.source_id = c.prov.sources[0].id;
  });

  const setSource = (i: number, k: keyof SourceRow) => (v: string) => update((c) => {
    const old = c.prov.sources[i].id;
    (c.prov.sources[i] as unknown as Record<string, string>)[k] = v;
    // Renaming the cited source keeps it cited.
    if (k === 'id' && c.prov.source_id === old) c.prov.source_id = v;
  });

  return (
    <section className="card">
      <SecHead title="Provenance" />
      <div className="stack-6">
        <span className="lbl">Origin of the coefficients <Sdk>provenance.origin.kind</Sdk></span>
        <div role="group" aria-label="Origin" className="seg self-start">
          {ORIGINS.map(([id, label]) => {
            const on = p.origin === id;
            return (
              <button key={id} type="button" className="seg-btn" title={ORIGIN_HINTS[id]} aria-pressed={on} onClick={() => pickOrigin(id)}
                style={{ background: on ? '#14181F' : 'transparent', color: on ? '#FFFFFF' : '#4A5160' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {needsSource && (
        <div className="stack-6">
          <span className="lbl">Cited source <Sdk>origin.source_id</Sdk></span>
          <div className="btn-row" style={{ gap: 6 }}>
            {picks.map((x, i) => {
              const on = p.source_id === x.id;
              return (
                <button key={i} type="button" className="btn" aria-pressed={on} onClick={() => update((c) => { c.prov.source_id = x.id; })}
                  style={{ background: on ? '#EEF2FF' : '#FFFFFF', borderColor: on ? ACCENT : errs.has('/provenance/origin/source_id') ? ERROR : BORDER }}>
                  {x.id}
                </button>
              );
            })}
          </div>
          {picks.length === 0 && <p className="hint" style={{ color: ERROR }}>Add a source first.</p>}
        </div>
      )}

      {p.origin === 'imported' && (
        <div className="grid-3">
          <TextField id="im-n" label="Importer" sdk="importer_name" value={p.importer_name} onChange={setProv('importer_name')} border={errs.border('/provenance/origin/importer_name')} />
          <TextField id="im-v" label="Version" sdk="importer_version" value={p.importer_version} onChange={setProv('importer_version')} border={errs.border('/provenance/origin/importer_version')} />
          <TextField id="im-s" label="Build SHA-256" sdk="optional" placeholder="64 hex characters" value={p.importer_sha} onChange={setProv('importer_sha')} border={errs.border('/provenance/origin/importer_build_sha256')} />
        </div>
      )}

      {p.origin === 'derived' && (
        <div className="grid-2">
          <div className="fld">
            <label htmlFor="dv-d">How it was derived <Sdk>origin.description</Sdk></label>
            <textarea id="dv-d" className="inp txt" value={p.description} onChange={(e) => setProv('description')(e.target.value)} style={{ borderColor: errs.border('/provenance/origin/description') }} />
          </div>
          <div className="fld">
            <label htmlFor="dv-p">Parent definitions, one per line <Sdk>derived_from</Sdk></label>
            <textarea id="dv-p" className="inp" placeholder="sha256:…" value={p.derived} onChange={(e) => setProv('derived')(e.target.value)}
              style={{ borderColor: errs.hasPrefix('/provenance/derived_from') ? ERROR : BORDER }} />
          </div>
        </div>
      )}

      <div className="stack-8">
        <span className="lbl">Sources <Sdk>provenance.sources</Sdk></span>
        {p.sources.map((x, i) => {
          const pfx = '/provenance/sources/' + i;
          const n = i + 1;
          return (
            <div key={i} className="source-row">
              <input className="inp" type="text" aria-label={'Source ' + n + ' id'} placeholder="id" value={x.id} onChange={(e) => setSource(i, 'id')(e.target.value)} style={{ borderColor: errs.border(pfx + '/id') }} />
              <select className="inp txt" aria-label={'Source ' + n + ' kind'} value={x.kind} onChange={(e) => setSource(i, 'kind')(e.target.value as SourceKind)}>
                <option value="publication">Publication</option>
                <option value="dataset">Dataset</option>
                <option value="code">Code</option>
                <option value="definition">Definition</option>
              </select>
              <input className="inp" type="text" aria-label={'Source ' + n + ' URI'} placeholder="URI" value={x.uri} onChange={(e) => setSource(i, 'uri')(e.target.value)} style={{ borderColor: errs.border(pfx + '/uri') }} />
              <button type="button" className="btn icon-btn" aria-label={'Remove source ' + n} onClick={() => update((c) => {
                const gone = c.prov.sources[i].id;
                c.prov.sources.splice(i, 1);
                if (c.prov.source_id === gone) c.prov.source_id = '';
              })}>
                <XIcon />
              </button>
              <input className="inp" type="text" aria-label={'Source ' + n + ' revision'} placeholder="Revision (optional)" value={x.revision} onChange={(e) => setSource(i, 'revision')(e.target.value)} style={{ gridColumn: '1 / 3' }} />
              <input className="inp" type="text" aria-label={'Source ' + n + ' content SHA-256'} placeholder="Content SHA-256 (optional)" value={x.sha} onChange={(e) => setSource(i, 'sha')(e.target.value)}
                style={{ gridColumn: '3 / 5', borderColor: errs.border(pfx + '/content_sha256') }} />
            </div>
          );
        })}
        <button type="button" className="btn self-start" onClick={() => update((c) => {
          const n = c.prov.sources.length + 1;
          c.prov.sources.push({ id: 'source-' + n, kind: 'publication', uri: '', revision: '', sha: '' });
          if ((c.prov.origin === 'published' || c.prov.origin === 'imported') && !c.prov.source_id) c.prov.source_id = 'source-' + n;
        })}>
          <PlusIcon /> Add source
        </button>
      </div>
    </section>
  );
}

function TextField({ id, label, sdk, value, onChange, border, placeholder }: { id: string; label: string; sdk: string; value: string; onChange: (v: string) => void; border: string; placeholder?: string }) {
  return (
    <div className="fld">
      <label htmlFor={id}>{label} <Sdk>{sdk}</Sdk></label>
      <input id={id} className="inp" type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={{ borderColor: border }} />
    </div>
  );
}
