import { useEffect, useState } from 'react';
import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';

export type CalloutSaveSectionProps = {
  error: string | null;
  isSaving: boolean;
  onCreate: (name: string) => Promise<boolean>;
  onOverwrite: (presetId: string) => Promise<boolean>;
  presets: CalloutPreset[];
};

export function CalloutSaveSettings(props: CalloutSaveSectionProps) {
  const locale = useAppLocale();
  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(props.presets[0]?.id ?? '');
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (props.presets.some((preset) => preset.id === selectedPresetId)) return;
    setSelectedPresetId(props.presets[0]?.id ?? '');
  }, [props.presets, selectedPresetId]);
  const options = props.presets.map((preset) => ({
    label: getCalloutPresetDisplayName(preset, locale),
    value: preset.id,
  }));
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label
          className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
          htmlFor="sniptale-callout-preset-name"
        >
          {translate('content.callout.saveNewPreset')}
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <ProductInput
            id="sniptale-callout-preset-name"
            aria-label={translate('content.callout.newPresetName')}
            className="cursor-text"
            disabled={props.isSaving}
            maxLength={64}
            placeholder={nameFocused ? '' : translate('content.callout.newPresetName')}
            style={{ cursor: 'text' }}
            value={name}
            onBlur={() => setNameFocused(false)}
            onChange={(event) => {
              setName(event.target.value);
              setStatus(null);
            }}
            onFocus={() => setNameFocused(true)}
          />
          <ProductActionButton
            compact
            disabled={!name.trim() || props.isSaving}
            onClick={() =>
              void props.onCreate(name).then((saved) => {
                if (!saved) return;
                setName('');
                setStatus(translate('content.callout.presetCreated'));
              })
            }
          >
            {translate('content.callout.createPresetAction')}
          </ProductActionButton>
        </div>
      </div>
      <div className="h-px bg-[var(--sniptale-color-border-soft)]" />
      <div className="grid gap-1.5">
        <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('content.callout.overwritePreset')}
        </div>
        <CompactSelect
          appearance="plain"
          aria-label={translate('content.callout.overwritePreset')}
          disabled={props.isSaving || options.length === 0}
          options={options}
          placeholder={translate('content.callout.selectPreset')}
          value={selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            setStatus(null);
          }}
        />
        <ProductActionButton
          compact
          tone="secondary"
          disabled={!selectedPresetId || props.isSaving}
          onClick={() =>
            void props.onOverwrite(selectedPresetId).then((saved) => {
              if (saved) setStatus(translate('content.callout.presetOverwritten'));
            })
          }
        >
          {translate('content.callout.overwritePresetAction')}
        </ProductActionButton>
      </div>
      {props.error ? (
        <div className="text-[10px] text-[var(--sniptale-color-danger)]" role="alert">
          {props.error}
        </div>
      ) : status ? (
        <div className="text-[10px] text-[var(--sniptale-color-text-secondary)]" role="status">
          {status}
        </div>
      ) : null}
    </div>
  );
}
