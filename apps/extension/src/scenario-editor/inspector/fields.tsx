import { useRef, type ReactNode } from 'react';
import {
  EDITOR_SCENE_BACKGROUND_PALETTE,
  EDITOR_TOOL_SHAPE_FILL_PALETTE,
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
  EDITOR_TOOL_TEXT_BACKGROUND_PALETTE,
  EDITOR_TOOL_TEXT_COLOR_PALETTE,
} from '../../features/editor/document/constants';
import {
  ColorField,
  NumericRow,
  OptionRow,
  SelectField,
  TextareaField,
  TextField,
} from '../../ui/compact-inspector-controls';
import type { CompactInspectorUnit } from '../../ui/compact-inspector-controls/shared';

type InspectorNumberScrub = boolean | { max: number; min: number; step?: number };
type InspectorNumberConstraint = {
  displayScale?: number;
  max: number;
  min: number;
  scrub?: boolean;
  step?: number;
  unit?: CompactInspectorUnit;
};

const SCENARIO_INSPECTOR_COLOR_PALETTE = [
  ...new Set([
    ...EDITOR_TOOL_SHAPE_STROKE_PALETTE,
    ...EDITOR_TOOL_SHAPE_FILL_PALETTE,
    ...EDITOR_TOOL_TEXT_COLOR_PALETTE,
    ...EDITOR_TOOL_TEXT_BACKGROUND_PALETTE,
    ...EDITOR_SCENE_BACKGROUND_PALETTE,
  ]),
];

function clampInspectorNumber(value: number, min: number | undefined, max: number | undefined) {
  if (!Number.isFinite(value)) {
    return min ?? 0;
  }
  return Math.min(Math.max(value, min ?? -Infinity), max ?? Infinity);
}

function useDedupedNumberCommit(onCommit: (value: number) => void) {
  const lastCommitRef = useRef<number | null>(null);
  return (value: number) => {
    if (lastCommitRef.current === value) {
      return;
    }
    lastCommitRef.current = value;
    onCommit(value);
  };
}

export function InspectorSection(props: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-2.5 border-b border-[var(--sniptale-color-border-soft)] pb-3">
      <h3 className="text-[11px] font-semibold uppercase text-[var(--sniptale-color-text-muted)]">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

export function InspectorTextField(props: {
  label: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
  value: string;
}) {
  if (props.multiline) {
    return <TextareaField label={props.label} value={props.value} onChange={props.onCommit} />;
  }

  return (
    <TextField
      key={props.value}
      label={props.label}
      defaultValue={props.value}
      onValueCommit={props.onCommit}
    />
  );
}

export function InspectorNumberField(props: {
  constraint?: InspectorNumberConstraint;
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  scrub?: InspectorNumberScrub;
  step?: number;
  value: number;
}) {
  const limits = {
    max: props.constraint?.max ?? props.max,
    min: props.constraint?.min ?? props.min,
  };
  const step = props.constraint?.step ?? props.step;
  const scrubEnabled = props.scrub ?? props.constraint?.scrub ?? false;
  const dedupedCommit = useDedupedNumberCommit(props.onCommit);
  const commitValue = (value: number) =>
    dedupedCommit(clampInspectorNumber(value, limits.min, limits.max));
  const scrub =
    typeof props.scrub === 'object'
      ? props.scrub
      : scrubEnabled && limits.min !== undefined && limits.max !== undefined
        ? { max: limits.max, min: limits.min, step: step ?? 1 }
        : undefined;

  return (
    <NumericRow
      label={props.label}
      max={limits.max}
      min={limits.min}
      scrub={scrub}
      step={step}
      unit={props.constraint?.unit}
      value={clampInspectorNumber(props.value, limits.min, limits.max)}
      onPreviewValue={commitValue}
      onCommitValue={commitValue}
    />
  );
}

export function InspectorBooleanField(props: {
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <OptionRow
      active={props.value}
      label={props.label}
      onToggle={() => props.onChange(!props.value)}
    />
  );
}

export function InspectorRangeField(props: {
  displayScale?: number;
  label: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step?: number;
  unit?: CompactInspectorUnit;
  value: number;
}) {
  const max = props.max;
  const min = props.min;
  const displayScale = props.displayScale ?? 1;
  const displayMax = max * displayScale;
  const displayMin = min * displayScale;
  const displayStep = (props.step ?? 1) * displayScale;
  const dedupedCommit = useDedupedNumberCommit(props.onCommit);
  const commitValue = (displayValue: number) =>
    dedupedCommit(clampInspectorNumber(displayValue / displayScale, min, max));

  return (
    <NumericRow
      label={props.label}
      max={displayMax}
      min={displayMin}
      step={displayStep}
      unit={props.unit}
      value={clampInspectorNumber(props.value, min, max) * displayScale}
      scrub={{
        max: displayMax,
        min: displayMin,
        step: displayStep,
      }}
      onPreviewValue={commitValue}
      onCommitValue={commitValue}
    />
  );
}

export function InspectorColorField(props: {
  label: string;
  onCommit: (value: string) => void;
  value: string;
}) {
  return (
    <ColorField
      label={props.label}
      palette={SCENARIO_INSPECTOR_COLOR_PALETTE}
      recentColors={[props.value]}
      title={props.label}
      value={props.value}
      onChange={props.onCommit}
    />
  );
}

export function InspectorNativeSelect<TValue extends string>(props: {
  label: string;
  onChange: (value: TValue) => void;
  options: Array<{ label: string; value: TValue }>;
  value: TValue;
}) {
  return (
    <SelectField
      label={props.label}
      value={props.value}
      options={props.options}
      onChange={props.onChange}
    />
  );
}
