import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  createSourceImageFilter,
  parseSourceImageFilterStack,
  type SourceImageFilterStack,
  type SourceImageFilter,
} from '../features/image-filters/contract';
import { translate, type TranslationKey } from '../platform/i18n';
import { CollapsibleSection, CompactSelect, ToggleField } from './compact-inspector-controls';
import { DraftNumericRow } from './compact-inspector-controls/numeric-preview';
const kinds = [
  'color',
  'monochrome',
  'sepia',
  'blur',
  'sharpen',
  'pixelate',
  'vignette',
  'grain',
  'bloom',
] as const;
const names: Record<SourceImageFilter['kind'], TranslationKey> = {
  color: 'videoEditor.sidebar.sourceFiltersColor',
  monochrome: 'videoEditor.sidebar.sourceFiltersMonochrome',
  sepia: 'videoEditor.sidebar.sourceFiltersSepia',
  sharpen: 'videoEditor.sidebar.sourceFiltersSharpen',
  pixelate: 'videoEditor.sidebar.sourceFiltersPixelate',
  vignette: 'videoEditor.sidebar.sourceFiltersVignette',
  grain: 'videoEditor.sidebar.sourceFiltersGrain',
  blur: 'videoEditor.sidebar.sourceFiltersBlur',
  bloom: 'videoEditor.sidebar.sourceFiltersBloom',
};
const addNames: Record<SourceImageFilter['kind'], TranslationKey> = {
  color: 'videoEditor.sidebar.sourceFiltersAddColor',
  monochrome: 'videoEditor.sidebar.sourceFiltersAddMonochrome',
  sepia: 'videoEditor.sidebar.sourceFiltersAddSepia',
  sharpen: 'videoEditor.sidebar.sourceFiltersAddSharpen',
  pixelate: 'videoEditor.sidebar.sourceFiltersAddPixelate',
  vignette: 'videoEditor.sidebar.sourceFiltersAddVignette',
  grain: 'videoEditor.sidebar.sourceFiltersAddGrain',
  blur: 'videoEditor.sidebar.sourceFiltersAddBlur',
  bloom: 'videoEditor.sidebar.sourceFiltersAddBloom',
};
const ranges: Record<
  string,
  { min: number; max: number; step: number; labelKey: TranslationKey } | undefined
> = {
  strength: { min: 0, max: 4, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersStrength' },
  size: { min: 0, max: 128, step: 1, labelKey: 'videoEditor.sidebar.sourceFiltersPixelSize' },
  amount: { min: 0, max: 1, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersAmount' },
  softness: { min: 0, max: 2, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersSoftness' },
  seed: { min: 0, max: 4294967295, step: 1, labelKey: 'videoEditor.sidebar.sourceFiltersSeed' },
  brightness: {
    min: 0,
    max: 4,
    step: 0.01,
    labelKey: 'videoEditor.sidebar.sourceFiltersBrightness',
  },
  exposure: { min: -4, max: 4, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersExposure' },
  contrast: { min: 0, max: 4, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersContrast' },
  saturation: {
    min: 0,
    max: 4,
    step: 0.01,
    labelKey: 'videoEditor.sidebar.sourceFiltersSaturation',
  },
  temperature: {
    min: -1,
    max: 1,
    step: 0.01,
    labelKey: 'videoEditor.sidebar.sourceFiltersTemperature',
  },
  tint: { min: -1, max: 1, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersTint' },
  radius: { min: 0, max: 64, step: 0.1, labelKey: 'videoEditor.sidebar.sourceFiltersRadius' },
  threshold: { min: 0, max: 1, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersThreshold' },
  gain: { min: 0, max: 4, step: 0.01, labelKey: 'videoEditor.sidebar.sourceFiltersGain' },
};
/** Controlled fields only. Each editor retains command, history, preview and persistence authority. */
export function SourceImageFilterFields(props: {
  value: SourceImageFilterStack | undefined;
  disabled?: boolean | undefined;
  onChange(value: SourceImageFilterStack | undefined): void;
}) {
  const filters = props.value?.filters ?? [];
  const publish = (next: unknown) => {
    if (props.disabled) return;
    const parsed = parseSourceImageFilterStack({ version: 1, filters: next });
    if (parsed) props.onChange(parsed.filters.length ? parsed : undefined);
  };
  const change = (id: string, patch: Partial<SourceImageFilter>) =>
    publish(filters.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const move = (index: number, delta: number) => {
    const next = [...filters],
      from = next[index],
      target = next[index + delta];
    if (!from || !target) return;
    next[index] = target;
    next[index + delta] = from;
    publish(next);
  };
  return (
    <fieldset
      disabled={props.disabled}
      className="sniptale-parameter-stack"
      data-ui="shared.ui.source-image-filter-fields"
    >
      <div className="px-2">
        <CompactSelect
          aria-label={translate('videoEditor.sidebar.sourceFiltersAdd')}
          placeholder={translate('videoEditor.sidebar.sourceFiltersAdd')}
          value=""
          disabled={props.disabled || filters.length >= 16}
          options={kinds.map((kind) => ({ value: kind, label: translate(addNames[kind]) }))}
          onChange={(kind) => {
            if (filters.length < 16)
              publish([...filters, createSourceImageFilter(kind, crypto.randomUUID())]);
          }}
        />
      </div>
      {filters.length === 0 ? (
        <p className="px-2 text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.sidebar.sourceFiltersEmpty')}
        </p>
      ) : null}
      {filters.map((entry, index) => (
        <CollapsibleSection
          key={entry.id}
          label={translate(names[entry.kind])}
          aria-label={translate(names[entry.kind])}
          defaultOpen
          data-source-filter-id={entry.id}
        >
          <div
            className="flex items-center justify-end gap-1 px-2"
            role="group"
            aria-label={translate(names[entry.kind])}
          >
            <ContentToolbarButton
              type="button"
              size="compact"
              aria-label={translate('videoEditor.sidebar.sourceFiltersUp')}
              title={translate('videoEditor.sidebar.sourceFiltersUp')}
              disabled={props.disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={14} aria-hidden="true" />
            </ContentToolbarButton>
            <ContentToolbarButton
              type="button"
              size="compact"
              aria-label={translate('videoEditor.sidebar.sourceFiltersDown')}
              title={translate('videoEditor.sidebar.sourceFiltersDown')}
              disabled={props.disabled || index === filters.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={14} aria-hidden="true" />
            </ContentToolbarButton>
            <ContentToolbarButton
              type="button"
              size="compact"
              aria-label={translate('common.actions.delete')}
              title={translate('common.actions.delete')}
              disabled={props.disabled}
              onClick={() => publish(filters.filter((item) => item.id !== entry.id))}
              tone="danger"
            >
              <Trash2 size={14} aria-hidden="true" />
            </ContentToolbarButton>
          </div>
          <ToggleField
            label={translate('videoEditor.sidebar.sourceFiltersEnabled')}
            showStatus
            value={entry.enabled}
            disabled={props.disabled}
            onChange={(enabled) => change(entry.id, { enabled })}
          />
          <div className="sniptale-parameter-stack sniptale-parameter-dependents">
            <DraftNumericRow
              label={translate('videoEditor.sidebar.sourceFiltersIntensity')}
              rangePresentation="field"
              value={entry.intensity * 100}
              min={0}
              max={100}
              step={1}
              precision={0}
              unit="%"
              disabled={!!props.disabled || !entry.enabled}
              onChange={(value) => change(entry.id, { intensity: value / 100 })}
            />
            {Object.entries(entry.parameters).map(([key, value]) => {
              const range =
                entry.kind === 'vignette' && key === 'radius'
                  ? {
                      min: 0,
                      max: 2,
                      step: 0.01,
                      labelKey: 'videoEditor.sidebar.sourceFiltersVignetteRadius' as const,
                    }
                  : ranges[key];
              if (!range) return null;
              return (
                <DraftNumericRow
                  key={key}
                  label={translate(range.labelKey)}
                  {...(key === 'seed'
                    ? { stepperPlacement: 'none' }
                    : { rangePresentation: 'field' })}
                  unit=""
                  value={value}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  precision={key === 'seed' ? 0 : 2}
                  disabled={!!props.disabled || !entry.enabled}
                  onChange={(value) =>
                    publish(
                      filters.map((item) =>
                        item.id === entry.id
                          ? { ...item, parameters: { ...item.parameters, [key]: value } }
                          : item
                      )
                    )
                  }
                />
              );
            })}
          </div>
        </CollapsibleSection>
      ))}
    </fieldset>
  );
}
