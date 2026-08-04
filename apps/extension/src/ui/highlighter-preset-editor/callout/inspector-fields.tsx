import type {
  CalloutColorSource,
  CalloutSettings,
  CalloutSettingsPatch,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassRow,
} from '@sniptale/ui/product-glass-controls';
import { PaintBucket, Palette, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { CompactColorSelector } from '../../color-selector';
import { NumericRow } from '../../compact-inspector-controls';
import { TextWithOverflowHint } from '../../compact-inspector-controls/overflow-hint';
import {
  resolveCalloutBoundColor,
  type CalloutFrameColors,
} from '../../../features/highlighter/callout-color-bindings';
import { translate } from '../../../platform/i18n';

export type ManualContentProps = {
  frameColors?: CalloutFrameColors | undefined;
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
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  palette: readonly string[];
  value: string;
}) {
  return (
    <PropertyField label={props.label}>
      <fieldset
        className={
          props.disabled ? 'm-0 min-w-0 border-0 p-0 opacity-55' : 'm-0 min-w-0 border-0 p-0'
        }
        disabled={props.disabled}
      >
        <CompactColorSelector
          label={props.label}
          title={props.label}
          value={props.value}
          palette={props.palette}
          onChange={props.onChange}
        />
      </fieldset>
    </PropertyField>
  );
}

const COLOR_SOURCES = ['custom', 'frame-border', 'frame-fill'] as const;

const COLOR_SOURCE_ICONS = {
  custom: Palette,
  'frame-border': Square,
  'frame-fill': PaintBucket,
} as const;

export function BoundColorField(props: {
  customColor: string;
  frameColors?: CalloutFrameColors | undefined;
  label: string;
  onColorChange: (value: string) => void;
  onSourceChange: (value: CalloutColorSource) => void;
  palette: readonly string[];
  source: CalloutColorSource;
}) {
  const frameColors = props.frameColors ?? {};
  const value = resolveCalloutBoundColor(props.source, props.customColor, frameColors);
  const sourceIndex = COLOR_SOURCES.indexOf(props.source);
  const nextSource = COLOR_SOURCES[(sourceIndex + 1) % COLOR_SOURCES.length] ?? 'custom';
  const SourceIcon = COLOR_SOURCE_ICONS[props.source];
  const sourceLabel = translate(`content.callout.colorSource.${props.source}`);
  const sourceTitle = `${translate('content.callout.colorSourceLabel')} — ${sourceLabel}`;
  return (
    <PropertyField label={props.label}>
      <div className="flex min-w-0 items-center gap-1.5">
        <fieldset
          className={
            props.source === 'custom'
              ? 'm-0 min-w-0 flex-1 border-0 p-0'
              : 'm-0 min-w-0 flex-1 border-0 p-0 opacity-55'
          }
          disabled={props.source !== 'custom'}
        >
          <CompactColorSelector
            key={props.source}
            label={props.label}
            title={props.label}
            value={value}
            palette={props.palette}
            onChange={props.onColorChange}
          />
        </fieldset>
        <ProductGlassBoldButton
          aria-label={sourceTitle}
          data-color-source={props.source}
          title={sourceTitle}
          onClick={() => props.onSourceChange(nextSource)}
        >
          <SourceIcon aria-hidden="true" size={14} strokeWidth={2} />
        </ProductGlassBoldButton>
      </div>
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
      appearance="plain"
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
