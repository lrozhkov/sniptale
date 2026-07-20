import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassChip,
  ProductGlassColorField,
  ProductGlassColorRow,
  ProductGlassDestructiveButton,
  ProductGlassRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type {
  CalloutAnchor,
  CalloutFontFamily,
  CalloutSettings,
  CalloutSide,
  CalloutVariant,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { CALLOUT_BACKGROUND_PRESETS, CALLOUT_TEXT_PRESETS } from '../callout/constants';
import { ANCHOR_GRID } from './anchor-grid';
import { CalloutFontFamilyRow } from './font-row';
import { CalloutSettingsPositionGrid } from './position-grid';
import { CalloutFontSizeRange, CalloutMaxWidthRange } from './size-ranges';
import { CalloutTailSizeRange } from './tail-range';

export function CalloutPositionSection(props: {
  anchor: CalloutAnchor;
  onAnchorChange: (anchor: CalloutAnchor) => void;
  onSideChange: (side: CalloutSide) => void;
  side: CalloutSide;
}) {
  return (
    <ContentPopoverSection
      title={translate('content.callout.positionSection')}
      dataUi="content.callout-settings.section"
    >
      <ProductGlassRow spread>
        <CalloutSettingsPositionGrid
          anchorGrid={ANCHOR_GRID}
          anchor={props.anchor}
          onAnchorChange={props.onAnchorChange}
          onSideChange={props.onSideChange}
          side={props.side}
        />
      </ProductGlassRow>
    </ContentPopoverSection>
  );
}

export function CalloutAppearanceSection(props: {
  bgColor: string;
  isTextOnly: boolean;
  onBackgroundChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onVariantChange: (variant: CalloutVariant) => void;
  textColor: string;
  variant: CalloutVariant;
  variantOptions: { value: CalloutVariant; label: string }[];
}) {
  return (
    <ContentPopoverSection
      title={translate('content.callout.appearanceSection')}
      dataUi="content.callout-settings.appearance-section"
    >
      <ProductGlassRow>
        {props.variantOptions.map(({ value, label }) => (
          <ProductGlassChip
            key={value}
            onClick={() => props.onVariantChange(value)}
            active={props.variant === value}
            style={{ flex: 1 }}
          >
            {label}
          </ProductGlassChip>
        ))}
      </ProductGlassRow>

      <ProductGlassColorRow>
        <ProductGlassColorField
          label={translate('content.callout.backgroundLabel')}
          value={props.bgColor}
          colors={CALLOUT_BACKGROUND_PRESETS}
          disabled={props.isTextOnly}
          onValueChange={props.onBackgroundChange}
          onPresetSelect={props.onBackgroundChange}
        />
        <ProductGlassColorField
          label={translate('content.callout.textLabel')}
          value={props.textColor}
          colors={CALLOUT_TEXT_PRESETS}
          onValueChange={props.onTextColorChange}
          onPresetSelect={props.onTextColorChange}
        />
      </ProductGlassColorRow>
    </ContentPopoverSection>
  );
}

export function CalloutTypographySection(props: {
  fontFamily: CalloutFontFamily;
  fontSize: number;
  fontWeight: CalloutSettings['fontWeight'];
  isTextOnly: boolean;
  maxWidth: number;
  onFontFamilyChange: (value: CalloutFontFamily) => void;
  onFontSizeChange: (value: number) => void;
  onFontWeightToggle: () => void;
  onMaxWidthChange: (value: number) => void;
  onTailSizeChange: (value: number) => void;
  tailSize: number;
}) {
  return (
    <ContentPopoverSection
      title={translate('content.callout.typographySection')}
      dataUi="content.callout-settings.typography-section"
    >
      <CalloutFontFamilyRow
        fontFamily={props.fontFamily}
        fontWeight={props.fontWeight}
        onFontFamilyChange={props.onFontFamilyChange}
        onFontWeightToggle={props.onFontWeightToggle}
      />

      <CalloutFontSizeRange fontSize={props.fontSize} onFontSizeChange={props.onFontSizeChange} />

      <CalloutMaxWidthRange maxWidth={props.maxWidth} onMaxWidthChange={props.onMaxWidthChange} />

      {!props.isTextOnly ? (
        <CalloutTailSizeRange tailSize={props.tailSize} onTailSizeChange={props.onTailSizeChange} />
      ) : null}
    </ContentPopoverSection>
  );
}

export function CalloutDeleteButton(props: { onDelete: () => void }) {
  return (
    <ProductGlassDestructiveButton onClick={props.onDelete}>
      {translate('content.callout.disableButton')}
    </ProductGlassDestructiveButton>
  );
}
