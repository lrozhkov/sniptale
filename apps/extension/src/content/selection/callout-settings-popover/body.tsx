import type {
  CalloutSettings,
  CalloutSide,
  CalloutVariant,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  CalloutAppearanceSection,
  CalloutDeleteButton,
  CalloutPositionSection,
  CalloutTypographySection,
} from './views';

export function CalloutSettingsPopoverContent(props: {
  handleDelete: () => void;
  handleSettingChange: (key: keyof CalloutSettings, value: unknown) => void;
  isTextOnly: boolean;
  localSettings: CalloutSettings;
  variantOptions: { value: CalloutVariant; label: string }[];
}) {
  const { handleSettingChange, isTextOnly, localSettings } = props;

  return (
    <>
      <CalloutPositionSection
        anchor={localSettings.anchor ?? 'top-center'}
        side={localSettings.side}
        onAnchorChange={(anchor) => handleSettingChange('anchor', anchor)}
        onSideChange={(side) => handleSettingChange('side', side as CalloutSide)}
      />

      <CalloutAppearanceSection
        bgColor={localSettings.bgColor}
        isTextOnly={isTextOnly}
        onBackgroundChange={(value) => handleSettingChange('bgColor', value)}
        onTextColorChange={(value) => handleSettingChange('textColor', value)}
        onVariantChange={(value) => handleSettingChange('variant', value)}
        textColor={localSettings.textColor}
        variant={localSettings.variant}
        variantOptions={props.variantOptions}
      />

      <CalloutTypographySection
        fontFamily={localSettings.fontFamily}
        fontSize={localSettings.fontSize}
        fontWeight={localSettings.fontWeight}
        isTextOnly={isTextOnly}
        maxWidth={localSettings.maxWidth}
        onFontFamilyChange={(value) => handleSettingChange('fontFamily', value)}
        onFontSizeChange={(value) => handleSettingChange('fontSize', value)}
        onFontWeightToggle={() =>
          handleSettingChange('fontWeight', localSettings.fontWeight === 'bold' ? 'normal' : 'bold')
        }
        onMaxWidthChange={(value) => handleSettingChange('maxWidth', value)}
        onTailSizeChange={(value) => handleSettingChange('tailSize', value)}
        tailSize={localSettings.tailSize}
      />

      <CalloutDeleteButton onDelete={props.handleDelete} />
    </>
  );
}
