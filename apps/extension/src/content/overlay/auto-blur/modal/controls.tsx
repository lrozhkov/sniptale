import type {
  BlurSettings,
  BlurType,
  BorderPreset,
} from '../../../../features/highlighter/contracts';
import { getBorderPresetDisplayName } from '../../../../features/highlighter/presets/display-name';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { CompactSelect, NumericRow } from '../../../../ui/compact-inspector-controls';
import { HighlighterPresetPropertyField as PropertyField } from '../../../../ui/highlighter-preset-editor/inspector-field';
import { buildBlurTypeOptions } from '../../../../composition/frame-annotation-controls/frame/helpers';

export function AutoBlurBlurControls(props: {
  blurSettings: BlurSettings;
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
  setBlurSettings: (settings: BlurSettings) => void;
}) {
  const locale = useAppLocale();
  const showBorder = props.blurSettings.showBorder ?? false;
  const selectedPresetId =
    props.blurSettings.borderPresetId &&
    props.borderPresets.some((preset) => preset.id === props.blurSettings.borderPresetId)
      ? props.blurSettings.borderPresetId
      : props.defaultBorderPresetId;
  const updateBlurSettings = (patch: Partial<BlurSettings>) =>
    props.setBlurSettings({ ...props.blurSettings, ...patch });

  return (
    <section className="sniptale-auto-blur-appearance sniptale-modal-field-surface grid gap-4">
      <div className="grid gap-1">
        <div className="text-sm font-semibold text-[var(--sniptale-color-text)]">
          {translate('content.autoBlur.appearanceTitle')}
        </div>
        <div className="text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
          {translate('content.autoBlur.appearanceDescription')}
        </div>
      </div>
      <div className="grid gap-3">
        <NumericRow
          appearance="plain"
          label={translate('content.autoBlur.blurStrength')}
          max={25}
          min={1}
          onCommitValue={(amount) => updateBlurSettings({ amount })}
          onPreviewValue={(amount) => updateBlurSettings({ amount })}
          scrub={{ max: 25, min: 1 }}
          value={props.blurSettings.amount}
        />
        <PropertyField label={translate('content.autoBlur.blurType')}>
          <CompactSelect<BlurType>
            appearance="plain"
            aria-label={translate('content.autoBlur.blurType')}
            onChange={(blurType) => updateBlurSettings({ blurType })}
            options={buildBlurTypeOptions().map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            value={props.blurSettings.blurType}
          />
        </PropertyField>
        <PropertyField label={translate('content.autoBlur.showBorder')}>
          <div className="flex justify-end">
            <ProductGlassSwitch
              aria-label={translate('content.autoBlur.showBorder')}
              on={showBorder}
              onClick={() => updateBlurSettings({ showBorder: !showBorder })}
            />
          </div>
        </PropertyField>
        <PropertyField label={translate('content.autoBlur.frameTemplate')}>
          <CompactSelect
            appearance="plain"
            aria-label={translate('content.autoBlur.frameTemplate')}
            disabled={!showBorder}
            onChange={(borderPresetId) => updateBlurSettings({ borderPresetId })}
            options={props.borderPresets.map((preset) => ({
              label: getBorderPresetDisplayName(preset, locale),
              value: preset.id,
            }))}
            value={selectedPresetId}
          />
        </PropertyField>
      </div>
    </section>
  );
}
