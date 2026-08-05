import { useEffect, useState } from 'react';
import type {
  StepBadgePreset,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CompactSelect } from '../../../ui/compact-inspector-controls';
import { getStepBadgePresetDisplayName } from '../../../features/highlighter/step-badge-presets/display-name';

export function StepBadgeSaveSection(props: {
  embedded?: boolean;
  onCreate: (name: string, settings: StepBadgeTemplateSettings) => Promise<{ outcome: string }>;
  onFloatingInteractionChange?: (open: boolean) => void;
  onUpdate: (
    preset: StepBadgePreset,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
  presets: StepBadgePreset[];
  settings: StepBadgeTemplateSettings;
}) {
  const locale = useAppLocale();
  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [selectedId, setSelectedId] = useState(props.presets[0]?.id ?? '');
  useEffect(() => {
    if (!props.presets.some((preset) => preset.id === selectedId))
      setSelectedId(props.presets[0]?.id ?? '');
  }, [props.presets, selectedId]);
  const content = (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label
          className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
          htmlFor="sniptale-step-badge-template-name"
        >
          {translate('content.stepBadge.saveAsTemplate')}
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <ProductInput
            id="sniptale-step-badge-template-name"
            aria-label={translate('content.stepBadge.templateName')}
            className="cursor-text"
            maxLength={64}
            placeholder={nameFocused ? '' : translate('content.stepBadge.templateName')}
            style={{ cursor: 'text' }}
            type="text"
            value={name}
            onBlur={() => setNameFocused(false)}
            onChange={(event) => setName(event.target.value)}
            onFocus={() => setNameFocused(true)}
          />
          <ProductActionButton
            compact
            disabled={!name.trim()}
            onClick={() =>
              void props.onCreate(name.trim(), props.settings).then((result) => {
                if (result.outcome === 'applied') setName('');
              })
            }
          >
            {translate('content.stepBadge.createTemplate')}
          </ProductActionButton>
        </div>
      </div>
      <div className="h-px bg-[var(--sniptale-color-border-soft)]" />
      <div className="grid gap-1.5">
        <div className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]">
          {translate('content.stepBadge.updateTemplate')}
        </div>
        <CompactSelect
          appearance="plain"
          aria-label={translate('content.stepBadge.selectTemplate')}
          options={props.presets.map((preset) => ({
            label: getStepBadgePresetDisplayName(preset, locale),
            value: preset.id,
          }))}
          placeholder={translate('content.stepBadge.selectTemplate')}
          value={selectedId}
          onChange={setSelectedId}
          {...(props.onFloatingInteractionChange
            ? { onOpenChange: props.onFloatingInteractionChange }
            : {})}
        />
        <ProductActionButton
          compact
          tone="secondary"
          disabled={!selectedId}
          onClick={() => {
            const preset = props.presets.find((item) => item.id === selectedId);
            if (preset) void props.onUpdate(preset, props.settings);
          }}
        >
          {translate('content.stepBadge.overwriteTemplate')}
        </ProductActionButton>
      </div>
    </div>
  );
  return props.embedded ? content : <ContentPopoverSection>{content}</ContentPopoverSection>;
}
