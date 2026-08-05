import { translate } from '../../../platform/i18n';
import { CALLOUT_BACKGROUND_PRESETS, CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import {
  BoundColorField,
  ColorField,
  NumericProperty,
  SettingsStack,
  type ManualContentProps,
} from './inspector-fields';

export function CalloutSizeSettings(props: ManualContentProps) {
  const typography = props.settings.style.typography;
  const surface = props.settings.style.surface;
  return (
    <SettingsStack>
      <NumericProperty
        label={translate('content.callout.defaultWidthLabel')}
        min={100}
        scrubMax={800}
        step={10}
        value={typography.maxWidth}
        onChange={(maxWidth) => props.onChange({ style: { typography: { maxWidth } } })}
      />
      <NumericProperty
        label={translate('content.callout.paddingXLabel')}
        min={0}
        max={48}
        value={surface.paddingX}
        onChange={(paddingX) => props.onChange({ style: { surface: { paddingX } } })}
      />
      <NumericProperty
        label={translate('content.callout.paddingYLabel')}
        min={0}
        max={48}
        value={surface.paddingY}
        onChange={(paddingY) => props.onChange({ style: { surface: { paddingY } } })}
      />
    </SettingsStack>
  );
}

export function CalloutBackgroundSettings(props: ManualContentProps) {
  const surface = props.settings.style.surface;
  return (
    <SettingsStack>
      <BoundColorField
        customColor={surface.backgroundColor}
        frameColors={props.frameColors}
        label={translate('content.callout.backgroundLabel')}
        palette={CALLOUT_BACKGROUND_PRESETS}
        source={props.settings.style.colorBindings.surfaceBackground}
        onColorChange={(backgroundColor) =>
          props.onChange({ style: { surface: { backgroundColor } } })
        }
        onSourceChange={(surfaceBackground) =>
          props.onChange({ style: { colorBindings: { surfaceBackground } } })
        }
      />
      <NumericProperty
        label={translate('content.callout.shadowLabel')}
        min={0}
        max={32}
        value={surface.shadow}
        onChange={(shadow) => props.onChange({ style: { surface: { shadow } } })}
      />
      <ColorField
        label={translate('content.callout.shadowColorLabel')}
        value={surface.shadowColor}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(shadowColor) => props.onChange({ style: { surface: { shadowColor } } })}
      />
    </SettingsStack>
  );
}
