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
  onCreate: (name: string, settings: StepBadgeTemplateSettings) => Promise<{ outcome: string }>;
  onUpdate: (
    preset: StepBadgePreset,
    settings: StepBadgeTemplateSettings
  ) => Promise<{ outcome: string }>;
  presets: StepBadgePreset[];
  settings: StepBadgeTemplateSettings;
}) {
  const locale = useAppLocale();
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState(props.presets[0]?.id ?? '');
  useEffect(() => {
    if (!props.presets.some((preset) => preset.id === selectedId))
      setSelectedId(props.presets[0]?.id ?? '');
  }, [props.presets, selectedId]);
  return (
    <ContentPopoverSection>
      <div className="grid gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <ProductInput
            maxLength={64}
            placeholder={translate('content.stepBadge.templateName')}
            value={name}
            onChange={(event) => setName(event.target.value)}
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
    </ContentPopoverSection>
  );
}
