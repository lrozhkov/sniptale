import type { CalloutShadowColorSource } from '@sniptale/runtime-contracts/highlighter/callout';
import { PaintBucket, Palette, Square } from 'lucide-react';
import { ProductGlassBoldButton } from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import { CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import {
  ColorField,
  NumericProperty,
  SettingsStack,
  type ManualContentProps,
} from './inspector-fields';
import { resolveCalloutColorBindings } from '../../../features/highlighter/callout-color-bindings';
import { CalloutBackgroundSettings as SharedCalloutBackgroundSettings } from '../../callout-background-settings';

const SHADOW_COLOR_SOURCES: CalloutShadowColorSource[] = [
  'custom',
  'surface-background',
  'surface-border',
];

const SHADOW_COLOR_SOURCE_ICONS = {
  custom: Palette,
  'surface-background': PaintBucket,
  'surface-border': Square,
} as const;

function ShadowColorField(props: ManualContentProps) {
  const source = props.settings.style.colorBindings.shadow;
  const sourceIndex = SHADOW_COLOR_SOURCES.indexOf(source);
  const nextSource =
    SHADOW_COLOR_SOURCES[(sourceIndex + 1) % SHADOW_COLOR_SOURCES.length] ?? 'custom';
  const SourceIcon = SHADOW_COLOR_SOURCE_ICONS[source];
  const label = translate('content.callout.shadowColorLabel');
  const sourceLabel = translate(`content.callout.shadowColorSource.${source}`);
  const resolvedColor = resolveCalloutColorBindings(props.settings.style, props.frameColors ?? {})
    .surface.shadowColor;
  return (
    <ColorField
      control={
        <ProductGlassBoldButton
          aria-label={`${label} — ${sourceLabel}`}
          data-shadow-color-source={source}
          onClick={() => props.onChange({ style: { colorBindings: { shadow: nextSource } } })}
          title={`${label} — ${sourceLabel}`}
        >
          <SourceIcon aria-hidden="true" size={14} strokeWidth={2} />
        </ProductGlassBoldButton>
      }
      disabled={source !== 'custom'}
      label={label}
      onChange={(shadowColor) => props.onChange({ style: { surface: { shadowColor } } })}
      palette={CALLOUT_TEXT_PRESETS}
      value={source === 'custom' ? props.settings.style.surface.shadowColor : resolvedColor}
    />
  );
}

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
      <SharedCalloutBackgroundSettings
        style={props.settings.style}
        onChange={(style) => props.onChange({ style })}
        {...(props.onNestedLayerChange ? { onOpenChange: props.onNestedLayerChange } : {})}
      />
      <NumericProperty
        label={translate('content.callout.shadowLabel')}
        min={0}
        max={32}
        value={surface.shadow}
        onChange={(shadow) => props.onChange({ style: { surface: { shadow } } })}
      />
      <ShadowColorField {...props} />
    </SettingsStack>
  );
}
