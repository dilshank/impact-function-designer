import { useEffect, useRef, useState, type DragEvent } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Returns errors to show, or null when the import succeeded. */
  onImport: (text: string, source: string) => string[] | null;
}

/** Paste or pick a definition JSON (pretty or canonical) or a knots/bins CSV. */
export function ImportDialog({ open, onClose, onImport }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setErrors([]);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setSource(file.name);
    setErrors([]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    load(e.dataTransfer.files[0]);
  };
  const submit = () => {
    const errs = onImport(text, source || 'pasted text');
    if (errs) setErrors(errs);
    else {
      setText('');
      setSource('');
    }
  };

  return (
    <dialog ref={ref} className="import-dialog" onClose={onClose} aria-labelledby="import-title">
      <div className="stack-12">
        <div className="sec-head">
          <h2 id="import-title" className="sec-h">Import an impact function</h2>
          <p className="sec-sub">
            Definition JSON, or a CSV of knots (x, y) or bins (lower, upper, value). Replaces the current definition.
          </p>
        </div>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <label className="btn">
            Choose file…
            <input type="file" accept=".json,.csv,.txt,application/json,text/csv" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {source && <span className="chip">{source}</span>}
        </div>
        <textarea
          className="inp import-text"
          aria-label="Definition to import"
          placeholder={'{\n  "schema_version": "1.0",\n  "semantics_version": "crc-impact/1",\n  "calibration": { … },\n  "model": { … }\n}'}
          value={text}
          onChange={(e) => { setText(e.target.value); setSource(''); setErrors([]); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          spellCheck={false}
        />
        {errors.length > 0 && (
          <ul className="import-errors" role="alert">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={submit}>Import</button>
        </div>
      </div>
    </dialog>
  );
}
