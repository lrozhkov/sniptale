import type {
  CalloutBadgeColorSource,
  CalloutFontFamily,
  CalloutTextDirection,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import {
  ProductGlassBoldButton,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';
import { CALLOUT_BACKGROUND_PRESETS, CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import {
  AdditionalSettings,
  ColorField,
  NumericProperty,
  PropertyField,
  SettingsStack,
  type ManualContentProps,
} from './inspector-fields';

const FONT_FAMILIES: CalloutFontFamily[] = ['sans', 'serif', 'mono', 'cursive'];
const DIRECTIONS: CalloutTextDirection[] = ['auto', 'ltr', 'rtl'];

type TypographyValues = {
  fontStyle: 'normal' | 'italic';
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textDecoration: 'none' | 'underline';
};

function TypographyButtons(props: {
  onChange: (patch: Partial<TypographyValues>) => void;
  value: TypographyValues;
}) {
  const alignments = [
    ['left', AlignLeft, 'content.callout.alignLeft'],
    ['center', AlignCenter, 'content.callout.alignCenter'],
    ['right', AlignRight, 'content.callout.alignRight'],
    ['justify', AlignJustify, 'content.callout.alignJustify'],
  ] as const;
  return (
    <div className="flex min-w-0 items-center justify-end gap-1">
      <ProductGlassBoldButton
        active={props.value.fontWeight === 'bold'}
        aria-label={translate('content.callout.boldTitle')}
        onClick={() =>
          props.onChange({ fontWeight: props.value.fontWeight === 'bold' ? 'normal' : 'bold' })
        }
      >
        <span className="text-[14px] font-bold">B</span>
      </ProductGlassBoldButton>
      <ProductGlassBoldButton
        active={props.value.fontStyle === 'italic'}
        aria-label={translate('content.callout.italicTitle')}
        onClick={() =>
          props.onChange({ fontStyle: props.value.fontStyle === 'italic' ? 'normal' : 'italic' })
        }
      >
        <span className="text-[14px] italic">I</span>
      </ProductGlassBoldButton>
      <ProductGlassBoldButton
        active={props.value.textDecoration === 'underline'}
        aria-label={translate('content.callout.underlineTitle')}
        onClick={() =>
          props.onChange({
            textDecoration: props.value.textDecoration === 'underline' ? 'none' : 'underline',
          })
        }
      >
        <span className="text-[14px] underline">U</span>
      </ProductGlassBoldButton>
      {alignments.map(([alignment, Icon, labelKey]) => (
        <ProductGlassBoldButton
          key={alignment}
          active={props.value.textAlign === alignment}
          aria-label={translate(labelKey)}
          onClick={() => props.onChange({ textAlign: alignment })}
        >
          <Icon size={15} />
        </ProductGlassBoldButton>
      ))}
    </div>
  );
}

function FontFamilyField(props: {
  onChange: (fontFamily: CalloutFontFamily) => void;
  value: CalloutFontFamily;
}) {
  return (
    <PropertyField compactLabel label={translate('content.callout.fontFamilyLabel')}>
      <CompactSelect
        appearance="plain"
        aria-label={translate('content.callout.fontFamilyLabel')}
        options={FONT_FAMILIES.map((value) => ({
          label: translate(`content.callout.font.${value}`),
          value,
        }))}
        value={props.value}
        onChange={props.onChange}
      />
    </PropertyField>
  );
}

function DirectionField(props: {
  onChange: (direction: CalloutTextDirection) => void;
  value: CalloutTextDirection;
}) {
  return (
    <PropertyField label={translate('content.callout.directionLabel')}>
      <CompactSelect
        appearance="plain"
        aria-label={translate('content.callout.directionLabel')}
        options={DIRECTIONS.map((value) => ({
          label: translate(`content.callout.direction.${value}`),
          value,
        }))}
        value={props.value}
        onChange={props.onChange}
      />
    </PropertyField>
  );
}

export function CalloutTextSettings(props: ManualContentProps) {
  const typography = props.settings.style.typography;
  const changeTypography = (patch: Partial<typeof typography>) =>
    props.onChange({ style: { typography: patch } });
  return (
    <SettingsStack>
      <ColorField
        label={translate('content.callout.textLabel')}
        onChange={(textColor) => props.onChange({ style: { surface: { textColor } } })}
        palette={CALLOUT_TEXT_PRESETS}
        value={props.settings.style.surface.textColor}
      />
      <FontFamilyField
        value={typography.fontFamily}
        onChange={(fontFamily) => changeTypography({ fontFamily })}
      />
      <TypographyButtons value={typography} onChange={changeTypography} />
      <NumericProperty
        label={translate('content.callout.fontSizeLabelPrefix')}
        max={72}
        min={10}
        scrubMax={36}
        value={typography.fontSize}
        onChange={(fontSize) => changeTypography({ fontSize })}
      />
      <AdditionalSettings>
        <NumericProperty
          label={translate('content.callout.lineHeightLabel')}
          max={3}
          min={0.8}
          step={0.05}
          unit=""
          value={typography.lineHeight}
          onChange={(lineHeight) => changeTypography({ lineHeight })}
        />
        <NumericProperty
          label={translate('content.callout.letterSpacingLabel')}
          max={20}
          min={-5}
          step={0.1}
          value={typography.letterSpacing}
          onChange={(letterSpacing) => changeTypography({ letterSpacing })}
        />
        <DirectionField
          value={typography.direction}
          onChange={(direction) => changeTypography({ direction })}
        />
        <PropertyField label={translate('content.callout.wordBreakLabel')}>
          <CompactSelect
            appearance="plain"
            aria-label={translate('content.callout.wordBreakLabel')}
            options={(['normal', 'break-word'] as const).map((value) => ({
              label: translate(`content.callout.wordBreak.${value}`),
              value,
            }))}
            value={typography.wordBreak}
            onChange={(wordBreak) => changeTypography({ wordBreak })}
          />
        </PropertyField>
        <PropertyField label={translate('content.callout.hyphensLabel')}>
          <CompactSelect
            appearance="plain"
            aria-label={translate('content.callout.hyphensLabel')}
            options={(['none', 'auto'] as const).map((value) => ({
              label: translate(`content.callout.hyphens.${value}`),
              value,
            }))}
            value={typography.hyphens}
            onChange={(hyphens) => changeTypography({ hyphens })}
          />
        </PropertyField>
      </AdditionalSettings>
    </SettingsStack>
  );
}

function BadgeColorSourceField(props: {
  label: string;
  onChange: (source: CalloutBadgeColorSource) => void;
  value: CalloutBadgeColorSource;
}) {
  const sources: CalloutBadgeColorSource[] = ['custom', 'frame-border', 'frame-fill', 'accent'];
  return (
    <PropertyField label={props.label}>
      <CompactSelect
        appearance="plain"
        aria-label={props.label}
        options={sources.map((value) => ({
          label: translate(`content.callout.badgeColorSource.${value}`),
          value,
        }))}
        value={props.value}
        onChange={props.onChange}
      />
    </PropertyField>
  );
}

function BadgeSettings(props: ManualContentProps) {
  const badge = props.settings.style.badge;
  const changeBadge = (patch: Partial<typeof badge>) => props.onChange({ style: { badge: patch } });
  return (
    <>
      <ProductGlassToggleRow
        title={translate('content.callout.badgeEnabled')}
        control={
          <ProductGlassSwitch
            aria-label={translate('content.callout.badgeEnabled')}
            on={badge.enabled}
            onClick={() => changeBadge({ enabled: !badge.enabled })}
          />
        }
      />
      {badge.enabled ? (
        <>
          <PropertyField label={translate('content.callout.badgeTextLabel')}>
            <ProductInput
              maxLength={64}
              placeholder={translate('content.callout.badgeTextPlaceholder')}
              value={badge.text}
              onChange={(event) => changeBadge({ text: event.target.value })}
            />
          </PropertyField>
          <PropertyField label={translate('content.callout.badgePlacementLabel')}>
            <CompactSelect
              appearance="plain"
              aria-label={translate('content.callout.badgePlacementLabel')}
              options={(['title-start', 'title-end', 'body-start'] as const).map((value) => ({
                label: translate(`content.callout.badgePlacement.${value}`),
                value,
              }))}
              value={badge.placement}
              onChange={(placement) => changeBadge({ placement })}
            />
          </PropertyField>
          <PropertyField label={translate('content.callout.badgeShapeLabel')}>
            <CompactSelect
              appearance="plain"
              aria-label={translate('content.callout.badgeShapeLabel')}
              options={(['circle', 'rounded', 'square'] as const).map((value) => ({
                label: translate(`content.callout.badgeShape.${value}`),
                value,
              }))}
              value={badge.shape}
              onChange={(shape) => changeBadge({ shape })}
            />
          </PropertyField>
          <NumericProperty
            label={translate('content.callout.badgeSizeLabel')}
            max={64}
            min={12}
            value={badge.size}
            onChange={(size) => changeBadge({ size })}
          />
          <BadgeColorSourceField
            label={translate('content.callout.badgeBackgroundSource')}
            value={badge.backgroundColorSource}
            onChange={(backgroundColorSource) => changeBadge({ backgroundColorSource })}
          />
          {badge.backgroundColorSource === 'custom' ? (
            <ColorField
              label={translate('content.callout.badgeBackgroundColor')}
              value={badge.backgroundColor}
              palette={CALLOUT_BACKGROUND_PRESETS}
              onChange={(backgroundColor) => changeBadge({ backgroundColor })}
            />
          ) : null}
          <BadgeColorSourceField
            label={translate('content.callout.badgeTextSource')}
            value={badge.textColorSource}
            onChange={(textColorSource) => changeBadge({ textColorSource })}
          />
          {badge.textColorSource === 'custom' ? (
            <ColorField
              label={translate('content.callout.badgeTextColor')}
              value={badge.textColor}
              palette={CALLOUT_TEXT_PRESETS}
              onChange={(textColor) => changeBadge({ textColor })}
            />
          ) : null}
          <NumericProperty
            label={translate('content.callout.badgeBorderWidth')}
            max={12}
            min={0}
            value={badge.borderWidth}
            onChange={(borderWidth) => changeBadge({ borderWidth })}
          />
          {badge.borderWidth > 0 ? (
            <BadgeColorSourceField
              label={translate('content.callout.badgeBorderSource')}
              value={badge.borderColorSource}
              onChange={(borderColorSource) => changeBadge({ borderColorSource })}
            />
          ) : null}
          {badge.borderWidth > 0 && badge.borderColorSource === 'custom' ? (
            <ColorField
              label={translate('content.callout.badgeBorderColor')}
              value={badge.borderColor}
              palette={CALLOUT_TEXT_PRESETS}
              onChange={(borderColor) => changeBadge({ borderColor })}
            />
          ) : null}
          <NumericProperty
            label={translate('content.callout.badgeFontSize')}
            max={32}
            min={8}
            value={badge.fontSize}
            onChange={(fontSize) => changeBadge({ fontSize })}
          />
          <PropertyField label={translate('content.callout.badgeFontWeight')}>
            <CompactSelect
              appearance="plain"
              aria-label={translate('content.callout.badgeFontWeight')}
              options={(['normal', 'bold'] as const).map((value) => ({
                label: translate(`content.callout.badgeFontWeight.${value}`),
                value,
              }))}
              value={badge.fontWeight}
              onChange={(fontWeight) => changeBadge({ fontWeight })}
            />
          </PropertyField>
        </>
      ) : null}
    </>
  );
}

export function CalloutTitleSettings(props: ManualContentProps) {
  const title = props.settings.style.title;
  const changeTitle = (patch: Partial<typeof title>) => props.onChange({ style: { title: patch } });
  return (
    <SettingsStack>
      <ProductGlassToggleRow
        title={translate('content.callout.titleToggle')}
        control={
          <ProductGlassSwitch
            aria-label={translate('content.callout.titleToggle')}
            on={title.enabled}
            onClick={() => changeTitle({ enabled: !title.enabled })}
          />
        }
      />
      {title.enabled ? (
        <>
          <FontFamilyField
            value={title.fontFamily}
            onChange={(fontFamily) => changeTitle({ fontFamily })}
          />
          <TypographyButtons value={title} onChange={changeTitle} />
          <NumericProperty
            label={translate('content.callout.titleFontSizeLabel')}
            max={144}
            min={10}
            scrubMax={72}
            value={title.fontSize}
            onChange={(fontSize) => changeTitle({ fontSize })}
          />
          <ColorField
            label={translate('content.callout.titleTextLabel')}
            value={title.textColor}
            palette={CALLOUT_TEXT_PRESETS}
            onChange={(textColor) => changeTitle({ textColor })}
          />
          <ColorField
            label={translate('content.callout.titleBackgroundLabel')}
            value={title.backgroundColor}
            palette={CALLOUT_BACKGROUND_PRESETS}
            onChange={(backgroundColor) => changeTitle({ backgroundColor })}
          />
          <AdditionalSettings>
            <NumericProperty
              label={translate('content.callout.lineHeightLabel')}
              max={3}
              min={0.8}
              step={0.05}
              unit=""
              value={title.lineHeight}
              onChange={(lineHeight) => changeTitle({ lineHeight })}
            />
            <NumericProperty
              label={translate('content.callout.letterSpacingLabel')}
              max={20}
              min={-5}
              step={0.1}
              value={title.letterSpacing}
              onChange={(letterSpacing) => changeTitle({ letterSpacing })}
            />
            <DirectionField
              value={title.direction}
              onChange={(direction) => changeTitle({ direction })}
            />
            <BadgeSettings {...props} />
          </AdditionalSettings>
        </>
      ) : (
        <AdditionalSettings>
          <BadgeSettings {...props} />
        </AdditionalSettings>
      )}
    </SettingsStack>
  );
}
