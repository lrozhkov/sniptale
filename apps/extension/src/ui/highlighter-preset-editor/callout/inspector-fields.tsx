import type {
  CalloutSettings,
  CalloutSettingsPatch,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ProductGlassChip, ProductGlassRow } from '@sniptale/ui/product-glass-controls';
import type { ReactNode } from 'react';
import { CompactColorSelector } from '../../color-selector';
import { NumericRow } from '../../compact-inspector-controls';
import { TextWithOverflowHint } from '../../compact-inspector-controls/overflow-hint';

export type ManualContentProps = {
  onChange: (patch: CalloutSettingsPatch) => void;
  settings: CalloutSettings;
};

export function PropertyField(props: {
  children: ReactNode;
  compactLabel?: boolean;
  label: string;
}) {
  return (
    <div
      data-ui="content.callout-settings.property-field"
      data-field-label={props.label}
      className={`grid min-w-0 items-center gap-2 ${
        props.compactLabel ? 'grid-cols-[4rem_minmax(0,1fr)]' : 'grid-cols-[7.5rem_minmax(0,1fr)]'
      }`}
    >
      <TextWithOverflowHint
        className="truncate text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
        text={props.label}
      />
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

export function ColorField(props: {
  label: string;
  onChange: (value: string) => void;
  palette: readonly string[];
  value: string;
}) {
  return (
    <PropertyField label={props.label}>
      <CompactColorSelector
        label={props.label}
        title={props.label}
        value={props.value}
        palette={props.palette}
        onChange={props.onChange}
      />
    </PropertyField>
  );
}

export function NumericProperty(props: {
  label: string;
  min: number;
  max?: number;
  scrubMax?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumericRow
      label={props.label}
      min={props.min}
      {...(props.max === undefined ? {} : { max: props.max })}
      step={props.step ?? 1}
      unit="px"
      value={props.value}
      scrub={{
        min: props.min,
        max: props.scrubMax ?? props.max ?? Math.max(800, props.value * 2),
        step: props.step ?? 1,
      }}
      onPreviewValue={props.onChange}
      onCommitValue={props.onChange}
    />
  );
}

export function SettingsStack(props: { children: ReactNode }) {
  return <div className="grid gap-2">{props.children}</div>;
}

export function ChoiceField<T extends string>(props: {
  getLabel: (value: T) => string;
  label: string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <PropertyField label={props.label}>
      <ProductGlassRow>
        {props.options.map((option) => (
          <ProductGlassChip
            key={option}
            active={option === props.value}
            onClick={() => props.onChange(option)}
          >
            {props.getLabel(option)}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>
    </PropertyField>
  );
}
