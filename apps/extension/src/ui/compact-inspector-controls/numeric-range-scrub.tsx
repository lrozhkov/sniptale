import {
  useState,
  useRef,
  type ReactNode,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { clampNumber, cx, type CompactInspectorNumericScrub } from './shared';

const NUMERIC_ROW_RANGE_INLINE_INSET = 'calc(0.75rem + var(--sniptale-range-thumb-size) / 2)';
const NUMERIC_ROW_RANGE_THUMB_OUTSET = 'calc(var(--sniptale-range-thumb-size) / -2)';
const NUMERIC_ROW_RANGE_FILL_COLOR =
  'var(--sniptale-range-fill-color, color-mix(in srgb, var(--sniptale-color-accent) 88%, white 12%))';
const NUMERIC_ROW_RANGE_TRACK_BACKGROUND = [
  'linear-gradient(90deg,',
  `${NUMERIC_ROW_RANGE_FILL_COLOR} 0,`,
  `${NUMERIC_ROW_RANGE_FILL_COLOR} var(--sniptale-range-fill-ratio),`,
  [
    'color-mix(in srgb, var(--sniptale-color-border-subtle) 76%,',
    'var(--sniptale-color-surface-canvas) 24%) var(--sniptale-range-fill-ratio),',
  ].join(' '),
  [
    'color-mix(in srgb, var(--sniptale-color-border-subtle) 76%,',
    'var(--sniptale-color-surface-canvas) 24%) 100%)',
  ].join(' '),
].join(' ');

interface NumericRangeScrubProps {
  active: boolean;
  disabled?: boolean | undefined;
  label: string;
  onActiveChange: (active: boolean) => void;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  scrub: CompactInspectorNumericScrub;
  step?: number | undefined;
  value: number | null;
  visible: boolean;
}

export function NumericRangeScrub(props: NumericRangeScrubProps) {
  return props.disabled ? null : <EnabledNumericRangeScrub {...props} />;
}

function EnabledNumericRangeScrub(props: NumericRangeScrubProps) {
  const [focused, setFocused] = useState(false);
  const state = getNumericRangeScrubState(props);
  const visible = props.visible || props.active || focused;

  return (
    <NumericRangeScrubShell visible={visible} rangeRatio={state.rangeRatio}>
      <NumericRangeTrack />
      <NumericRangeInput
        label={props.label}
        onFocusChange={setFocused}
        onActiveChange={props.onActiveChange}
        onCommitValue={props.onCommitValue}
        onPreviewValue={props.onPreviewValue}
        readValue={state.readValue}
        rangeMax={state.rangeMax}
        rangeMin={state.rangeMin}
        rangeRatio={state.rangeRatio}
        rangeStep={state.rangeStep}
        rangeValue={state.rangeValue}
        visible={visible}
      />
    </NumericRangeScrubShell>
  );
}

function getNumericRangeScrubState(props: NumericRangeScrubProps) {
  const rangeValue = clampNumber(
    props.scrub.value ?? props.value ?? props.scrub.min,
    props.scrub.min,
    props.scrub.max
  );
  const rangeMin = props.scrub.min;
  const rangeMax = props.scrub.max;
  const rangeStep = props.scrub.step ?? props.step ?? 1;
  const range = rangeMax - rangeMin;
  const rangeRatio = range > 0 ? ((rangeValue - rangeMin) / range) * 100 : 0;
  const readValue = (value: number) => {
    const scrubValue = snapRangeProposal(value, rangeMin, rangeMax, rangeStep);
    return props.scrub.toValue ? props.scrub.toValue(scrubValue) : scrubValue;
  };
  return { rangeMax, rangeMin, rangeRatio, rangeStep, rangeValue, readValue };
}

function NumericRangeScrubShell({
  children,
  rangeRatio,
  visible,
}: {
  children: ReactNode;
  rangeRatio: number;
  visible: boolean;
}) {
  return (
    <div
      data-ui="shared.ui.compact-inspector.numeric-range-scrub"
      aria-hidden={visible ? undefined : true}
      className={cx(
        'pointer-events-none absolute transition-opacity',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={getRangeShellStyle(rangeRatio)}
    >
      {children}
    </div>
  );
}

function NumericRangeTrack() {
  return (
    <span
      data-ui="shared.ui.compact-inspector.numeric-range-track"
      className="absolute left-0 right-0 rounded-full"
      style={{
        height: 'var(--sniptale-range-track-height)',
        top: 'calc(var(--sniptale-range-track-height) / -2)',
        background: NUMERIC_ROW_RANGE_TRACK_BACKGROUND,
      }}
    />
  );
}

function NumericRangeInput(props: {
  onFocusChange: (focused: boolean) => void;
  label: string;
  onActiveChange: (active: boolean) => void;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  rangeMax: number;
  rangeMin: number;
  rangeRatio: number;
  rangeStep: number;
  rangeValue: number;
  readValue: (value: number) => number;
  visible: boolean;
}) {
  const pointerFocus = useRef(false);
  const pendingValue = useRef<number | null>(null);
  const preview = (value: number) => {
    pendingValue.current = props.readValue(value);
    props.onPreviewValue(pendingValue.current);
  };
  const handleRangeCommit = () => {
    if (pendingValue.current === null) return;
    const value = pendingValue.current;
    pendingValue.current = null;
    props.onCommitValue(value);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    props.onFocusChange(true);
    const value = rangeKeyboardValue(event, props.rangeMin, props.rangeMax, props.rangeStep);
    if (value === null) return;
    event.preventDefault();
    preview(value);
  };

  return (
    <input
      aria-label={`${props.label} range`}
      type="range"
      min={props.rangeMin}
      max={props.rangeMax}
      // Native step sanitization must not round controlled values derived from coupled fields.
      step="any"
      disabled={props.rangeMax <= props.rangeMin}
      value={props.rangeValue}
      onFocus={() => props.onFocusChange(!pointerFocus.current)}
      onKeyDown={handleKeyDown}
      onChange={(event) => preview(event.currentTarget.valueAsNumber)}
      onPointerDown={(event) => {
        pointerFocus.current = true;
        props.onFocusChange(false);
        handlePointerActiveChange(event, props.onActiveChange, true);
      }}
      onPointerUp={(event) => {
        handlePointerActiveChange(event, props.onActiveChange, false);
        handleRangeCommit();
      }}
      onPointerCancel={(event) => {
        handlePointerActiveChange(event, props.onActiveChange, false);
        handleRangeCommit();
      }}
      onKeyUp={handleRangeCommit}
      onBlur={() => {
        pointerFocus.current = false;
        props.onFocusChange(false);
        handleRangeCommit();
        props.onActiveChange(false);
      }}
      tabIndex={props.visible ? 0 : -1}
      className={cx(
        'sniptale-range sniptale-range--edge absolute',
        props.visible ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      style={getRangeInputStyle(props.rangeRatio)}
    />
  );
}

/** Snap user proposals only; derived controlled values and exact interval endpoints stay intact. */
function snapRangeProposal(value: number, min: number, max: number, step: number): number {
  const bounded = clampNumber(value, min, max);
  if (bounded === min || bounded === max) return bounded;
  const snapped = min + Math.round((bounded - min) / step) * step;
  return clampNumber(Number(snapped.toPrecision(15)), min, max);
}

function rangeKeyboardValue(
  event: KeyboardEvent<HTMLInputElement>,
  min: number,
  max: number,
  step: number
): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Home') return min;
  if (event.key === 'End') return max;
  let delta: number;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      delta = 1;
      break;
    case 'ArrowLeft':
    case 'ArrowDown':
      delta = -1;
      break;
    case 'PageUp':
      delta = 10;
      break;
    case 'PageDown':
      delta = -10;
      break;
    default:
      return null;
  }
  const position = (Number(event.currentTarget.value) - min) / step;
  const tick = delta > 0 ? Math.floor(position + 1e-10) : Math.ceil(position - 1e-10);
  return snapRangeProposal(min + (tick + delta) * step, min, max, step);
}

function handlePointerActiveChange(
  event: PointerEvent<HTMLInputElement>,
  onActiveChange: (active: boolean) => void,
  active: boolean
) {
  event.stopPropagation();
  onActiveChange(active);
}

function getRangeShellStyle(rangeRatio: number): CSSProperties {
  return {
    bottom: '-1px',
    left: NUMERIC_ROW_RANGE_INLINE_INSET,
    right: NUMERIC_ROW_RANGE_INLINE_INSET,
    '--sniptale-range-fill-ratio': `${rangeRatio}%`,
    '--sniptale-range-track-height': '4px',
    '--sniptale-range-thumb-size': '16px',
  } as CSSProperties;
}

function getRangeInputStyle(rangeRatio: number): CSSProperties {
  return {
    left: NUMERIC_ROW_RANGE_THUMB_OUTSET,
    right: NUMERIC_ROW_RANGE_THUMB_OUTSET,
    top: NUMERIC_ROW_RANGE_THUMB_OUTSET,
    width: 'auto',
    '--sniptale-range-fill-ratio': `${rangeRatio}%`,
    '--sniptale-range-shell-height': 'var(--sniptale-range-thumb-size)',
    '--sniptale-range-track-height': '4px',
    '--sniptale-range-thumb-size': '16px',
  } as CSSProperties;
}
