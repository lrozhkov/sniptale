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
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import {
  loadHighlighterAdditionalSettingsOpen,
  saveHighlighterAdditionalSettingsOpen,
  type HighlighterAdditionalSettingsSection,
} from '../../../composition/persistence/highlighter/additional-settings';
import { CompactColorSelector } from '../../color-selector';
import { NumericRow } from '../../compact-inspector-controls';
import { HighlighterPresetPropertyField as PropertyField } from '../inspector-field';
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

export { PropertyField };

export function ColorField(props: {
  control?: ReactNode;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  palette: readonly string[];
  value: string;
}) {
  return (
    <PropertyField label={props.label}>
      <div className="flex min-w-0 items-center gap-1.5">
        <fieldset
          className={
            props.disabled
              ? 'm-0 min-w-0 flex-1 border-0 p-0 opacity-55'
              : 'm-0 min-w-0 flex-1 border-0 p-0'
          }
          disabled={props.disabled}
        >
          <CompactColorSelector
            disabled={props.disabled === true}
            label={props.label}
            title={props.label}
            value={props.value}
            palette={props.palette}
            onChange={props.onChange}
          />
        </fieldset>
        {props.control}
      </div>
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
            disabled={props.source !== 'custom'}
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
  unit?: '' | '%' | 'deg' | 'px';
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
      unit={props.unit ?? 'px'}
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

const knownAdditionalSettingsState = new Map<HighlighterAdditionalSettingsSection, boolean>();

export function AdditionalSettings(props: {
  children: ReactNode;
  section: HighlighterAdditionalSettingsSection;
}) {
  const [isOpen, setIsOpen] = useState(
    () => knownAdditionalSettingsState.get(props.section) ?? false
  );
  const changedByUser = useRef(false);

  useEffect(() => {
    if (knownAdditionalSettingsState.has(props.section)) return;
    let active = true;
    void loadHighlighterAdditionalSettingsOpen(props.section).then((storedOpen) => {
      if (!active || changedByUser.current) return;
      knownAdditionalSettingsState.set(props.section, storedOpen);
      setIsOpen(storedOpen);
    });
    return () => {
      active = false;
    };
  }, [props.section]);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    if (nextOpen === isOpen) return;
    changedByUser.current = true;
    knownAdditionalSettingsState.set(props.section, nextOpen);
    setIsOpen(nextOpen);
    void saveHighlighterAdditionalSettingsOpen(props.section, nextOpen);
  };

  return (
    <details
      className="group mt-1 border-t border-[color:var(--sniptale-color-border-soft)] pt-1.5"
      onToggle={handleToggle}
      open={isOpen}
    >
      <summary
        className={[
          'cursor-pointer select-none text-[11px] font-semibold',
          'text-[var(--sniptale-color-text-secondary)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {translate('content.callout.additionalSettings')}
      </summary>
      <div className="mt-2 grid gap-2">{props.children}</div>
    </details>
  );
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
