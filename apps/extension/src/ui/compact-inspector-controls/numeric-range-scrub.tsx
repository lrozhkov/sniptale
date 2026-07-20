import {
  type ReactNode,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { clampNumber, cx, type CompactInspectorNumericScrub } from './shared';

const NUMERIC_ROW_RANGE_INLINE_INSET = 'calc(0.75rem + var(--sniptale-range-thumb-size) / 2)';
const NUMERIC_ROW_RANGE_THUMB_OUTSET = 'calc(var(--sniptale-range-thumb-size) / -2)';
const NUMERIC_ROW_RANGE_TRACK_BACKGROUND = [
  'linear-gradient(90deg,',
  'color-mix(in srgb, var(--sniptale-color-accent) 88%, white 12%) 0,',
  'color-mix(in srgb, var(--sniptale-color-accent) 88%, white 12%) var(--sniptale-range-fill-ratio),',
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
  if (props.disabled) {
    return null;
  }

  const state = getNumericRangeScrubState(props);
  const visible = props.visible || props.active;

  return (
    <NumericRangeScrubShell visible={visible} rangeRatio={state.rangeRatio}>
      <NumericRangeTrack />
      <NumericRangeInput
        label={props.label}
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
  const range = Math.max(1, rangeMax - rangeMin);
  const rangeRatio = ((rangeValue - rangeMin) / range) * 100;
  const readValue = (event: RangeCommitEvent | ChangeEvent<HTMLInputElement>) => {
    const scrubValue = clampNumber(Number(event.currentTarget.value), rangeMin, rangeMax);
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
  label: string;
  onActiveChange: (active: boolean) => void;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  rangeMax: number;
  rangeMin: number;
  rangeRatio: number;
  rangeStep: number;
  rangeValue: number;
  readValue: (event: RangeCommitEvent | ChangeEvent<HTMLInputElement>) => number;
  visible: boolean;
}) {
  const handleRangeCommit = (event: RangeCommitEvent) => {
    props.onCommitValue(props.readValue(event));
  };

  return (
    <input
      aria-label={`${props.label} range`}
      type="range"
      min={props.rangeMin}
      max={props.rangeMax}
      step={props.rangeStep}
      value={props.rangeValue}
      onChange={(event) => props.onPreviewValue(props.readValue(event))}
      onPointerDown={(event) => handlePointerActiveChange(event, props.onActiveChange, true)}
      onPointerUp={(event) => {
        handlePointerActiveChange(event, props.onActiveChange, false);
        handleRangeCommit(event);
      }}
      onKeyUp={handleRangeCommit}
      onBlur={(event) => {
        handleRangeCommit(event);
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

type RangeCommitEvent =
  | FocusEvent<HTMLInputElement>
  | KeyboardEvent<HTMLInputElement>
  | PointerEvent<HTMLInputElement>;
