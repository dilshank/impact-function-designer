import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { blank, num, plain, stepNumber } from '../domain/numbers';
import { fmtImpactNum, type ImpactFormat } from '../domain/presets';
import type { DesignerState } from '../domain/state';

export const ACCENT = '#1D4ED8';
export const BORDER = '#C9CDD4';
export const ERROR = '#B91C1C';

export type Update = (fn: (draft: DesignerState) => void) => void;

/** Error-path lookup shared by every card. */
export interface Errs {
  has: (path: string) => boolean;
  hasPrefix: (prefix: string) => boolean;
  border: (path: string) => string;
}

/** What a numeric field needs to know about units and the plot range. */
export interface FieldCtx {
  u: ImpactFormat;
  xu: string;
  span: number;
}

/** impact: response units; exposure: x units; rate: per x unit; plain: no unit. */
export type FieldKind = 'impact' | 'exposure' | 'rate' | 'plain';

interface NumFieldProps {
  value: string;
  onChange: (v: string) => void;
  kind: FieldKind;
  ctx: FieldCtx;
  id?: string;
  aria?: string;
  optional?: boolean;
  invalid?: boolean;
  /** Amount one click, one held-button tick or one arrow key moves the value. */
  step?: number;
}

export const DEFAULT_STEP = 0.1;
const HOLD_DELAY_MS = 450;
const HOLD_REPEAT_MS = 120;

/**
 * A unit-aware number input. The stepper buttons and ↑ ↓ move the value by `step`
 * (0.1 unless set; money defaults to the currency step); hold a button to keep stepping,
 * Shift for ×10. Reformats on blur.
 */
export function NumField({ value, onChange, kind, ctx, id, aria, optional, invalid, step: stepProp }: NumFieldProps) {
  const { u, xu } = ctx;
  const isImp = kind === 'impact';
  const step = stepProp ?? (isImp && u.currency ? u.step : DEFAULT_STEP);
  const format = (v: number) => (isImp ? fmtImpactNum(v, u) : plain(v));
  const prefix = isImp ? u.prefix : '';
  const suffix = isImp ? u.suffix : kind === 'rate' ? 'per ' + xu : kind === 'plain' ? '' : xu;

  const onBlur = () => {
    if (optional && blank(value)) return;
    const v = num(value);
    if (Number.isFinite(v)) {
      const f = format(v);
      if (f !== value) onChange(f);
    }
  };
  // Held buttons step from the latest value, not the one captured when the press began.
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | undefined>(undefined);
  const bump = (dir: 1 | -1, mult: number) => {
    const next = format(stepNumber(valueRef.current, dir, step * mult));
    valueRef.current = next;
    onChange(next);
  };
  const stopHold = () => window.clearTimeout(timer.current);
  useEffect(() => stopHold, []);
  const startHold = (dir: 1 | -1) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const mult = e.shiftKey ? 10 : 1;
    bump(dir, mult);
    stopHold();
    const repeat = () => {
      bump(dir, mult);
      timer.current = window.setTimeout(repeat, HOLD_REPEAT_MS);
    };
    timer.current = window.setTimeout(repeat, HOLD_DELAY_MS);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
  };
  const what = aria || 'value';

  return (
    <div className="affix" style={{ borderColor: invalid ? ERROR : BORDER }}>
      {prefix && <span className="affix-pre">{prefix}</span>}
      <input
        id={id}
        className="affix-inp"
        type="text"
        inputMode="decimal"
        aria-label={aria}
        placeholder={optional ? 'None' : ''}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {suffix && <span className="affix-suf">{suffix}</span>}
      <span className="stepper">
        {([1, -1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            className="step-btn"
            aria-label={(dir === 1 ? 'Increase ' : 'Decrease ') + what + ' by ' + step}
            title={(dir === 1 ? '+' : '−') + step + ' (hold to repeat, Shift ×10)'}
            onPointerDown={startHold(dir)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
          >
            <svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d={dir === 1 ? 'M1 5l4-4 4 4' : 'M1 1l4 4 4-4'} />
            </svg>
          </button>
        ))}
      </span>
    </div>
  );
}

export function SecHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="sec-head">
      <h2 className="sec-h">{title}</h2>
      {sub && <p className="sec-sub">{sub}</p>}
    </div>
  );
}

export function Sdk({ children }: { children: ReactNode }) {
  return <span className="sdk">{children}</span>;
}

export function XIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
