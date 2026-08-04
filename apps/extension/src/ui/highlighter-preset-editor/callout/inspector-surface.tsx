import type { CalloutFontFamily } from '@sniptale/runtime-contracts/highlighter/callout';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import {
  ProductGlassBoldButton,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';
import { CALLOUT_BACKGROUND_PRESETS, CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import {
  ColorField,
  NumericProperty,
  PropertyField,
  SettingsStack,
  type ManualContentProps,
} from './inspector-fields';

export function CalloutTextSettings(props: ManualContentProps) {
  const typography = props.settings.style.typography;
  const title = props.settings.style.title;
  const fontOptions = (['sans', 'serif', 'mono'] as CalloutFontFamily[]).map((value) => ({
    value,
    label: translate(`content.callout.font.${value}`),
  }));
  return (
    <SettingsStack>
      <ColorField
        label={translate('content.callout.textLabel')}
        value={props.settings.style.surface.textColor}
        palette={CALLOUT_TEXT_PRESETS}
        onChange={(textColor) => props.onChange({ style: { surface: { textColor } } })}
      />
      <PropertyField compactLabel label={translate('content.callout.fontFamilyLabel')}>
        <CompactSelect
          aria-label={translate('content.callout.fontFamilyLabel')}
          options={fontOptions}
          value={typography.fontFamily}
          onChange={(fontFamily) => props.onChange({ style: { typography: { fontFamily } } })}
        />
      </PropertyField>
      <div
        data-ui="content.callout-settings.text-formatting"
        className="flex min-w-0 items-center justify-end gap-1"
      >
        <ProductGlassBoldButton
          aria-label={translate('content.callout.boldTitle')}
          title={translate('content.callout.boldTitle')}
          active={typography.fontWeight === 'bold'}
          onClick={() =>
            props.onChange({
              style: {
                typography: {
                  fontWeight: typography.fontWeight === 'bold' ? 'normal' : 'bold',
                },
              },
            })
          }
        >
          <span className="text-[14px] font-bold">B</span>
        </ProductGlassBoldButton>
        <ProductGlassBoldButton
          aria-label={translate('content.callout.italicTitle')}
          title={translate('content.callout.italicTitle')}
          active={typography.fontStyle === 'italic'}
          onClick={() =>
            props.onChange({
              style: {
                typography: {
                  fontStyle: typography.fontStyle === 'italic' ? 'normal' : 'italic',
                },
              },
            })
          }
        >
          <span className="text-[14px] italic">I</span>
        </ProductGlassBoldButton>
        <ProductGlassBoldButton
          aria-label={translate('content.callout.underlineTitle')}
          title={translate('content.callout.underlineTitle')}
          active={typography.textDecoration === 'underline'}
          onClick={() =>
            props.onChange({
              style: {
                typography: {
                  textDecoration: typography.textDecoration === 'underline' ? 'none' : 'underline',
                },
              },
            })
          }
        >
          <span className="text-[14px] underline">U</span>
        </ProductGlassBoldButton>
        <ProductGlassBoldButton
          aria-label={translate('content.callout.alignLeft')}
          title={translate('content.callout.alignLeft')}
          active={typography.textAlign === 'left'}
          onClick={() => props.onChange({ style: { typography: { textAlign: 'left' } } })}
        >
          <AlignLeft size={15} />
        </ProductGlassBoldButton>
        <ProductGlassBoldButton
          aria-label={translate('content.callout.alignCenter')}
          title={translate('content.callout.alignCenter')}
          active={typography.textAlign === 'center'}
          onClick={() => props.onChange({ style: { typography: { textAlign: 'center' } } })}
        >
          <AlignCenter size={15} />
        </ProductGlassBoldButton>
        <ProductGlassBoldButton
          aria-label={translate('content.callout.alignRight')}
          title={translate('content.callout.alignRight')}
          active={typography.textAlign === 'right'}
          onClick={() => props.onChange({ style: { typography: { textAlign: 'right' } } })}
        >
          <AlignRight size={15} />
        </ProductGlassBoldButton>
        <ProductGlassBoldButton
          aria-label={translate('content.callout.alignJustify')}
          title={translate('content.callout.alignJustify')}
          active={typography.textAlign === 'justify'}
          onClick={() => props.onChange({ style: { typography: { textAlign: 'justify' } } })}
        >
          <AlignJustify size={15} />
        </ProductGlassBoldButton>
      </div>
      <NumericProperty
        label={translate('content.callout.fontSizeLabelPrefix')}
        min={10}
        max={72}
        scrubMax={36}
        value={typography.fontSize}
        onChange={(fontSize) => props.onChange({ style: { typography: { fontSize } } })}
      />
      <ProductGlassToggleRow
        title={translate('content.callout.titleToggle')}
        control={
          <ProductGlassSwitch
            aria-label={translate('content.callout.titleToggle')}
            on={title.enabled}
            onClick={() => props.onChange({ style: { title: { enabled: !title.enabled } } })}
          />
        }
      />
      {title.enabled ? (
        <>
          <ColorField
            label={translate('content.callout.titleTextLabel')}
            value={title.textColor}
            palette={CALLOUT_TEXT_PRESETS}
            onChange={(textColor) => props.onChange({ style: { title: { textColor } } })}
          />
          <NumericProperty
            label={translate('content.callout.titleFontSizeLabel')}
            min={10}
            max={144}
            scrubMax={72}
            value={title.fontSize}
            onChange={(fontSize) => props.onChange({ style: { title: { fontSize } } })}
          />
        </>
      ) : null}
    </SettingsStack>
  );
}

export function CalloutSizeSettings(props: ManualContentProps) {
  const typography = props.settings.style.typography;
  const surface = props.settings.style.surface;
  return (
    <SettingsStack>
      <NumericProperty
        label={translate('content.callout.defaultWidthLabel')}
        min={80}
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
  const title = props.settings.style.title;
  return (
    <SettingsStack>
      <ColorField
        label={translate('content.callout.backgroundLabel')}
        value={surface.backgroundColor}
        palette={CALLOUT_BACKGROUND_PRESETS}
        onChange={(backgroundColor) => props.onChange({ style: { surface: { backgroundColor } } })}
      />
      {title.enabled ? (
        <ColorField
          label={translate('content.callout.titleBackgroundLabel')}
          value={title.backgroundColor}
          palette={CALLOUT_BACKGROUND_PRESETS}
          onChange={(backgroundColor) => props.onChange({ style: { title: { backgroundColor } } })}
        />
      ) : null}
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
