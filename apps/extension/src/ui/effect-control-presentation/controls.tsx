import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  resolveEffectLocaleText,
  type ControlDefinition,
  type EffectV1ControlUnit,
} from '@sniptale/runtime-contracts/effect-v1';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { SelectField, SegmentedRow, TextareaField } from '../compact-inspector-controls';
import { InspectorParameterRow } from '../compact-inspector-controls/layout';
import {
  resolveCompactUnitLabel,
  type CompactInspectorUnit,
  type CompactInspectorNumericScrub,
} from '../compact-inspector-controls/shared';

/** Units decorate values only; graph controls always retain their raw authored scale. */
export function effectControlUnit(unit: EffectV1ControlUnit | undefined): CompactInspectorUnit {
  return unit === 'percent' ? '%' : (unit ?? '');
}

/** Missing slider bounds get a usable viewport; typed values retain authored bounds. */
export function effectControlSliderRange(
  control: Extract<ControlDefinition, { kind: 'number' }>,
  value: number
): CompactInspectorNumericScrub {
  return {
    min: control.min ?? Math.min(0, value, (control.max ?? 100) - 100),
    max: control.max ?? Math.max(100, value, (control.min ?? 0) + 100),
    step: control.step ?? 1,
  };
}

/** Metadata does not add a second layout or icon column to standard parameter rows. */
export function EffectControlFrame(props: { control: ControlDefinition; children: ReactNode }) {
  return (
    <div className="min-w-0" data-effect-control-id={props.control.id}>
      {props.children}
    </div>
  );
}

/** Both editor adapters select the same widget and preserve typed option values. */
export function EffectControlChoices(props: {
  control: ControlDefinition;
  value: number | string;
  locale: string;
  disabled: boolean;
  onChange(value: number | string): void;
}) {
  const descriptionId = useId();
  const options = props.control.options;
  if (!options?.length) return null;
  const label = resolveEffectLocaleText(props.control.label, props.locale) || props.control.id;
  const unit = resolveCompactUnitLabel(effectControlUnit(props.control.unit));
  const entries = options.map((option, index) => ({
    value: String(index),
    label: `${resolveEffectLocaleText(option.label, props.locale)}${unit ? ` ${unit}` : ''}`,
    disabled: props.disabled,
  }));
  const selected = options.findIndex((option) => option.value === props.value);
  const change = (id: string) => {
    const option = options.find((_, index) => String(index) === id);
    if (option) props.onChange(option.value);
  };
  if (props.control.presentation === 'toggle') {
    const value = entries[selected]?.label ?? '';
    return (
      <InspectorParameterRow label={label} keepInline>
        <span id={descriptionId} className="min-w-0 truncate text-xs">
          {value}
        </span>
        <ProductGlassSwitch
          role="switch"
          aria-label={label}
          aria-describedby={descriptionId}
          aria-checked={selected === 1}
          on={selected === 1}
          disabled={props.disabled}
          onClick={() => change(selected === 1 ? '0' : '1')}
        />
      </InspectorParameterRow>
    );
  }
  if (props.control.presentation === 'segmented')
    return (
      <SegmentedRow
        label={label}
        ariaLabel={label}
        options={entries}
        value={selected < 0 ? '' : String(selected)}
        onChange={change}
        columns={entries.length <= 3 ? (entries.length === 2 ? 2 : 3) : 2}
      />
    );
  return (
    <SelectField
      label={label}
      disabled={props.disabled}
      options={entries}
      value={selected < 0 ? '' : String(selected)}
      onChange={change}
    />
  );
}

/** Native text areas share ordinary text-field acceptance: blur/Ctrl+Enter commit, Escape cancels. */
export function EffectControlTextarea(props: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState(props.value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <TextareaField
      label={props.label}
      value={draft}
      disabled={props.disabled}
      onChange={setDraft}
      onFocus={() => {
        cancelled.current = false;
      }}
      onBlur={() => {
        if (!cancelled.current && draft !== props.value) props.onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelled.current = true;
          setDraft(props.value);
          event.currentTarget.blur();
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
