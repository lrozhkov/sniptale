import type {
  BlurSettings,
  BlurType,
  BorderPreset,
} from '../../../../features/highlighter/contracts';
import { getBorderPresetDisplayName } from '../../../../features/highlighter/presets/display-name';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { NumericRow, SelectField, ToggleField } from '../../../../ui/compact-inspector-controls';
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
    <section className="sniptale-auto-blur-appearance sniptale-inspector-surface grid gap-2">
      <div className="grid gap-1">
        <div className="text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]">
          {translate('content.autoBlur.appearanceTitle')}
        </div>
        <div className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
          {translate('content.autoBlur.appearanceDescription')}
        </div>
      </div>
      <div className="sniptale-parameter-stack">
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
        <SelectField<BlurType>
          label={translate('content.autoBlur.blurType')}
          onChange={(blurType) => updateBlurSettings({ blurType })}
          options={buildBlurTypeOptions().map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          value={props.blurSettings.blurType}
        />
        <ToggleField
          label={translate('content.autoBlur.showBorder')}
          value={showBorder}
          onChange={(showBorder) => updateBlurSettings({ showBorder })}
        />
        <SelectField
          label={translate('content.autoBlur.frameTemplate')}
          onChange={(borderPresetId) => updateBlurSettings({ borderPresetId })}
          options={props.borderPresets.map((preset) => ({
            label: getBorderPresetDisplayName(preset, locale),
            value: preset.id,
          }))}
          value={selectedPresetId}
        />
      </div>
    </section>
  );
}
