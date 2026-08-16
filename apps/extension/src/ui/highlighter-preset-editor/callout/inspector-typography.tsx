import type {
  CalloutBadgeColorSource,
  CalloutFontFamily,
  CalloutTextDirection,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  PaintBucket,
  Palette,
  PanelTop,
  Square,
} from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductGlassBoldButton } from '@sniptale/ui/product-glass-controls';
import { CompactPaintSelector } from '../../paint-selector';
import { translate } from '../../../platform/i18n';
import { CompactSelect } from '../../compact-inspector-controls';
import { CALLOUT_BACKGROUND_PRESETS, CALLOUT_TEXT_PRESETS } from './inspector-palettes';
import { resolveCalloutColorBindings } from '../../../features/highlighter/callout-color-bindings';
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
    <div
      className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-3"
      data-ui="shared.callout-typography-controls"
    >
      <div className="flex items-center justify-start gap-1" data-ui="shared.callout-emphasis">
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
      </div>
      <div className="flex items-center justify-end gap-1" data-ui="shared.callout-alignment">
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
        label={translate('content.callout.textColorLabel')}
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
      <AdditionalSettings section="callout-text">
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

const BADGE_COLOR_SOURCES: CalloutBadgeColorSource[] = [
  'custom',
  'frame-border',
  'frame-fill',
  'accent',
];

const BADGE_COLOR_SOURCE_ICONS = {
  custom: Palette,
  'frame-border': Square,
  'frame-fill': PaintBucket,
  accent: PanelTop,
} as const;

function BadgeColorField(props: {
  customColor: string;
  label: string;
  onColorChange: (color: string) => void;
  onSourceChange: (source: CalloutBadgeColorSource) => void;
  palette: readonly string[];
  resolvedColor: string;
  source: CalloutBadgeColorSource;
  sourceLabel: string;
}) {
  const sourceIndex = BADGE_COLOR_SOURCES.indexOf(props.source);
  const nextSource =
    BADGE_COLOR_SOURCES[(sourceIndex + 1) % BADGE_COLOR_SOURCES.length] ?? 'custom';
  const SourceIcon = BADGE_COLOR_SOURCE_ICONS[props.source];
  const sourceName = translate(`content.callout.badgeColorSource.${props.source}`);
  const sourceTitle = `${props.sourceLabel} — ${sourceName}`;
  return (
    <ColorField
      control={
        <ProductGlassBoldButton
          aria-label={sourceTitle}
          data-badge-color-source={props.source}
          title={sourceTitle}
          onClick={() => props.onSourceChange(nextSource)}
        >
          <SourceIcon aria-hidden="true" size={14} strokeWidth={2} />
        </ProductGlassBoldButton>
      }
      disabled={props.source !== 'custom'}
      label={props.label}
      onChange={props.onColorChange}
      palette={props.palette}
      value={props.source === 'custom' ? props.customColor : props.resolvedColor}
    />
  );
}

export function CalloutBadgeSettings(props: ManualContentProps) {
  const badge = props.settings.style.badge;
  const resolvedBadge = resolveCalloutColorBindings(
    props.settings.style,
    props.frameColors ?? {}
  ).badge;
  const changeBadge = (patch: Partial<typeof badge>) => props.onChange({ style: { badge: patch } });
  return (
    <>
      {badge.enabled ? (
        <>
          <PropertyField label={translate('content.callout.badgeTextLabel')}>
            <ProductInput
              className="sniptale-input-compact cursor-text"
              maxLength={64}
              placeholder={translate('content.callout.badgeTextPlaceholder')}
              type="text"
              value={badge.text}
              onChange={(event) => changeBadge({ text: event.target.value })}
            />
          </PropertyField>
          <PropertyField label={translate('content.callout.badgePlacementLabel')}>
            <CompactSelect
              appearance="plain"
              aria-label={translate('content.callout.badgePlacementLabel')}
              options={(props.settings.style.title.enabled
                ? (['title-start', 'title-end', 'body-start'] as const)
                : (['body-start'] as const)
              ).map((value) => ({
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
          <BadgeColorField
            customColor={badge.backgroundColor}
            label={translate('content.callout.badgeBackgroundColor')}
            onColorChange={(backgroundColor) => changeBadge({ backgroundColor })}
            onSourceChange={(backgroundColorSource) => changeBadge({ backgroundColorSource })}
            palette={CALLOUT_BACKGROUND_PRESETS}
            resolvedColor={resolvedBadge.backgroundColor}
            source={badge.backgroundColorSource}
            sourceLabel={translate('content.callout.badgeBackgroundSource')}
          />
          <BadgeColorField
            customColor={badge.textColor}
            label={translate('content.callout.badgeTextColor')}
            onColorChange={(textColor) => changeBadge({ textColor })}
            onSourceChange={(textColorSource) => changeBadge({ textColorSource })}
            palette={CALLOUT_TEXT_PRESETS}
            resolvedColor={resolvedBadge.textColor}
            source={badge.textColorSource}
            sourceLabel={translate('content.callout.badgeTextSource')}
          />
          <NumericProperty
            label={translate('content.callout.badgeBorderWidth')}
            max={12}
            min={0}
            value={badge.borderWidth}
            onChange={(borderWidth) => changeBadge({ borderWidth })}
          />
          {badge.borderWidth > 0 ? (
            <BadgeColorField
              customColor={badge.borderColor}
              label={translate('content.callout.badgeBorderColor')}
              onColorChange={(borderColor) => changeBadge({ borderColor })}
              onSourceChange={(borderColorSource) => changeBadge({ borderColorSource })}
              palette={CALLOUT_TEXT_PRESETS}
              resolvedColor={resolvedBadge.borderColor}
              source={badge.borderColorSource}
              sourceLabel={translate('content.callout.badgeBorderSource')}
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
                label: translate(
                  value === 'normal'
                    ? 'content.callout.badgeFontWeightNormal'
                    : 'content.callout.badgeFontWeightBold'
                ),
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
      {title.enabled ? (
        <>
          <PropertyField label={translate('content.callout.titleTextLabel')}>
            <ProductInput
              className="sniptale-input-compact cursor-text"
              maxLength={256}
              placeholder={translate('content.callout.titleTextPlaceholder')}
              type="text"
              value={props.settings.content.titleText}
              onChange={(event) =>
                props.onChange({ content: { titleText: event.currentTarget.value } })
              }
            />
          </PropertyField>
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
            label={translate('content.callout.titleTextColorLabel')}
            value={title.textColor}
            palette={CALLOUT_TEXT_PRESETS}
            onChange={(textColor) => changeTitle({ textColor })}
          />
          <PropertyField label={translate('content.callout.titleFillModeLabel')}>
            <CompactSelect
              appearance="plain"
              aria-label={translate('content.callout.titleFillModeLabel')}
              options={(['separate', 'unified'] as const).map((value) => ({
                label: translate(`content.callout.titleFillMode.${value}`),
                value,
              }))}
              value={title.fillMode}
              onChange={(fillMode) => changeTitle({ fillMode })}
            />
          </PropertyField>
          {title.fillMode === 'separate' ? (
            <CompactPaintSelector
              label={translate('content.callout.titleBackgroundLabel')}
              palette={CALLOUT_BACKGROUND_PRESETS}
              title={translate('content.callout.titleBackgroundLabel')}
              value={title.fillPaint}
              onChange={(fillPaint) => changeTitle({ fillPaint })}
            />
          ) : null}
          <AdditionalSettings section="callout-title">
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
          </AdditionalSettings>
        </>
      ) : null}
    </SettingsStack>
  );
}
