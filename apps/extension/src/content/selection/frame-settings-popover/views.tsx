import { Droplet, Square, Waves } from 'lucide-react';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassOptionGrid,
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
  ProductGlassPresetName,
  ProductGlassPresetPreview,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type {
  BlurSettings,
  BlurType,
  BorderPreset,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import { buildBlurTypeOptions, getBorderPresetPreviewStyle } from './helpers';

function BlurTypeIcon(props: { iconName: 'droplet' | 'waves' | 'square' }) {
  if (props.iconName === 'droplet') {
    return <Droplet size={15} />;
  }

  if (props.iconName === 'waves') {
    return <Waves size={15} />;
  }

  return <Square size={15} />;
}

export function FrameSettingsPopoverContent(props: {
  effectMode: EffectMode;
  globalSettings: HighlighterSettings;
  handleBlurChange: (amount: number) => void;
  handleBlurShowBorderChange: (showBorder: boolean) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  handleFocusChange: (opacity: number) => void;
  handleFocusShowBorderChange: (showBorder: boolean) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  selectedPresetId: string;
}) {
  return (
    <>
      {props.effectMode === 'border' ? (
        <FrameBorderSection
          borderPresets={props.globalSettings.borderPresets}
          handleSelectPreset={props.handleSelectPreset}
          selectedPresetId={props.selectedPresetId}
        />
      ) : null}

      {props.effectMode === 'blur' ? (
        <FrameBlurSection
          handleBlurChange={props.handleBlurChange}
          handleBlurShowBorderChange={props.handleBlurShowBorderChange}
          handleBlurTypeChange={props.handleBlurTypeChange}
          localBlurSettings={props.localBlurSettings}
        />
      ) : null}

      {props.effectMode === 'focus' ? (
        <FrameFocusSection
          handleFocusChange={props.handleFocusChange}
          handleFocusShowBorderChange={props.handleFocusShowBorderChange}
          localFocusSettings={props.localFocusSettings}
        />
      ) : null}
    </>
  );
}

function FrameBorderSection(props: {
  borderPresets: BorderPreset[];
  handleSelectPreset: (preset: BorderPreset) => void;
  selectedPresetId: string;
}) {
  return (
    <ContentPopoverSection title={translate('content.overlayControls.frameStyleLabel')}>
      <ProductGlassPresetList>
        {props.borderPresets.map((preset) => {
          const isSelected = props.selectedPresetId === preset.id;

          return (
            <ProductGlassPresetItem
              key={preset.id}
              onClick={() => props.handleSelectPreset(preset)}
              active={isSelected}
            >
              <ProductGlassPresetPreview style={getBorderPresetPreviewStyle(preset)} />
              <ProductGlassPresetMeta>
                <ProductGlassPresetName>{preset.name}</ProductGlassPresetName>
              </ProductGlassPresetMeta>
            </ProductGlassPresetItem>
          );
        })}
      </ProductGlassPresetList>
    </ContentPopoverSection>
  );
}

function FrameBlurSection(props: {
  handleBlurChange: (amount: number) => void;
  handleBlurShowBorderChange: (showBorder: boolean) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  localBlurSettings: BlurSettings;
}) {
  return (
    <>
      <FrameBlurStrengthSection
        amount={props.localBlurSettings.amount}
        handleBlurChange={props.handleBlurChange}
      />
      <FrameBlurTypeSection
        blurType={props.localBlurSettings.blurType}
        handleBlurShowBorderChange={props.handleBlurShowBorderChange}
        handleBlurTypeChange={props.handleBlurTypeChange}
        showBorder={props.localBlurSettings.showBorder ?? false}
      />
    </>
  );
}

function FrameBlurStrengthSection(props: {
  amount: number;
  handleBlurChange: (amount: number) => void;
}) {
  const title = `${translate('content.overlayControls.blurStrengthLabelPrefix')} ${props.amount}`;

  return (
    <ContentPopoverSection title={title}>
      <ProductGlassRange
        type="range"
        min={1}
        max={25}
        value={props.amount}
        onChange={(event) => props.handleBlurChange(parseInt(event.target.value, 10))}
      />
      <ProductGlassRangeMeta>
        <span>1</span>
        <span>13</span>
        <span>25</span>
      </ProductGlassRangeMeta>
    </ContentPopoverSection>
  );
}

function FrameBlurTypeSection(props: {
  blurType: BlurType;
  handleBlurShowBorderChange: (showBorder: boolean) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  showBorder: boolean;
}) {
  return (
    <ContentPopoverSection title={translate('content.overlayControls.blurTypeLabel')}>
      <ProductGlassOptionGrid>
        {buildBlurTypeOptions().map((option) => {
          const isActive = props.blurType === option.value;

          return (
            <ProductGlassChip
              key={option.value}
              onClick={() => props.handleBlurTypeChange(option.value)}
              title={option.label}
              stacked
              active={isActive}
            >
              <ProductGlassChipIcon>
                <BlurTypeIcon iconName={option.iconName} />
              </ProductGlassChipIcon>
              <span>{option.label}</span>
            </ProductGlassChip>
          );
        })}
      </ProductGlassOptionGrid>

      <ProductGlassToggleRow
        title={translate('content.overlayControls.showBorderTitle')}
        hint={translate('content.overlayControls.showBorderHint')}
        control={
          <ProductGlassSwitch
            onClick={() => props.handleBlurShowBorderChange(!props.showBorder)}
            on={props.showBorder}
          />
        }
      />
    </ContentPopoverSection>
  );
}

function FrameFocusSection(props: {
  handleFocusChange: (opacity: number) => void;
  handleFocusShowBorderChange: (showBorder: boolean) => void;
  localFocusSettings: FocusSettings;
}) {
  const title = `${translate('content.overlayControls.focusDimmingLabelPrefix')} ${Math.round(
    props.localFocusSettings.opacity * 100
  )}%`;

  return (
    <ContentPopoverSection title={title}>
      <ProductGlassRange
        type="range"
        min={10}
        max={100}
        value={props.localFocusSettings.opacity * 100}
        onChange={(event) => props.handleFocusChange(parseInt(event.target.value, 10) / 100)}
      />
      <ProductGlassRangeMeta>
        <span>10%</span>
        <span>55%</span>
        <span>100%</span>
      </ProductGlassRangeMeta>

      <ProductGlassToggleRow
        title={translate('content.overlayControls.showBorderTitle')}
        hint={translate('content.overlayControls.focusBorderHint')}
        control={
          <ProductGlassSwitch
            onClick={() =>
              props.handleFocusShowBorderChange(!(props.localFocusSettings.showBorder ?? false))
            }
            on={props.localFocusSettings.showBorder ?? false}
          />
        }
      />
    </ContentPopoverSection>
  );
}
