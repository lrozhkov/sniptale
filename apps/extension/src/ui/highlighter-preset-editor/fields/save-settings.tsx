import { useEffect, useState } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';

export function BorderManualSaveSettings(props: {
  disabled?: boolean;
  isSaving: boolean;
  onFloatingInteractionChange?: (open: boolean) => void;
  onSave: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  presets: BorderPreset[];
}) {
  const locale = useAppLocale();
  const [name, setName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState(props.presets[0]?.id ?? '');
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (props.presets.some((preset) => preset.id === selectedPresetId)) return;
    setSelectedPresetId(props.presets[0]?.id ?? '');
  }, [props.presets, selectedPresetId]);
  const options = props.presets.map((preset) => ({
    label: getBorderPresetDisplayName(preset, locale),
    value: preset.id,
  }));
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('content.overlayControls.frameStyleSaveNew')}
        </label>
        <ProductInput
          aria-label={translate('content.overlayControls.frameStylePresetName')}
          disabled={props.isSaving}
          maxLength={50}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setStatus(null);
          }}
          placeholder={translate('content.overlayControls.frameStylePresetName')}
          value={name}
        />
        <ProductActionButton
          compact
          disabled={!name.trim() || props.isSaving || props.disabled}
          onClick={() =>
            void props.onSave({ name }).then((saved) => {
              if (!saved) return;
              setName('');
              setStatus(translate('content.overlayControls.frameStyleCreated'));
            })
          }
        >
          {translate('content.overlayControls.frameStyleCreate')}
        </ProductActionButton>
      </div>
      <div className="h-px bg-[var(--sniptale-color-border-soft)]" />
      <div className="grid gap-1.5">
        <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('content.overlayControls.frameStyleOverwrite')}
        </div>
        <CompactSelect
          appearance="plain"
          aria-label={translate('content.overlayControls.frameStyleOverwrite')}
          disabled={props.isSaving || options.length === 0}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            setStatus(null);
          }}
          {...(props.onFloatingInteractionChange
            ? { onOpenChange: props.onFloatingInteractionChange }
            : {})}
          options={options}
          placeholder={translate('content.overlayControls.frameStyleSelectPreset')}
          value={selectedPresetId}
        />
        <ProductActionButton
          compact
          disabled={!selectedPresetId || props.isSaving || props.disabled}
          onClick={() => {
            const overwrite = props.presets.find((preset) => preset.id === selectedPresetId);
            if (!overwrite) return;
            void props.onSave({ overwrite }).then((saved) => {
              if (saved) setStatus(translate('content.overlayControls.frameStyleOverwritten'));
            });
          }}
          tone="secondary"
        >
          {translate('content.overlayControls.frameStyleOverwriteAction')}
        </ProductActionButton>
      </div>
      {status ? (
        <div className="text-[10px] text-[var(--sniptale-color-text-secondary)]" role="status">
          {status}
        </div>
      ) : null}
    </div>
  );
}
