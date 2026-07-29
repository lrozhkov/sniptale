import { Droplet, Eye, EyeOff, Plus, Settings2, Square, Waves } from 'lucide-react';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassOptionGrid,
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
  ProductGlassPresetPreview,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { translate, useAppLocale } from '../../../platform/i18n';
import type {
  BlurSettings,
  BlurType,
  BorderPreset,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import { buildBlurTypeOptions, getBorderPresetPreviewStyle } from './helpers';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { createTrustedContentActionIntentSource } from '../../application/privileged-action-intent';
import { FramePresetName } from './overflow-hint';

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
  handleAddPreset: () => void;
  handleEditPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId: string;
}) {
  const decorationEnabled =
    props.effectMode === 'border' ||
    (props.effectMode === 'blur'
      ? (props.localBlurSettings.showBorder ?? false)
      : (props.localFocusSettings.showBorder ?? false));
  const handleDecorationToggle =
    props.effectMode === 'blur'
      ? props.handleBlurShowBorderChange
      : props.effectMode === 'focus'
        ? props.handleFocusShowBorderChange
        : undefined;

  return (
    <>
      <FrameBorderSection
        borderPresets={props.globalSettings.borderPresets}
        decorationEnabled={decorationEnabled}
        effectMode={props.effectMode}
        handleAddPreset={props.handleAddPreset}
        handleEditPreset={props.handleEditPreset}
        handleSelectPreset={props.handleSelectPreset}
        handleTogglePresetEnabled={props.handleTogglePresetEnabled}
        pendingPresetIds={props.pendingPresetIds}
        selectedPresetId={props.selectedPresetId}
        {...(handleDecorationToggle === undefined ? {} : { handleDecorationToggle })}
      />

      {props.effectMode === 'blur' ? (
        <FrameBlurSection
          handleBlurChange={props.handleBlurChange}
          handleBlurTypeChange={props.handleBlurTypeChange}
          localBlurSettings={props.localBlurSettings}
        />
      ) : null}

      {props.effectMode === 'focus' ? (
        <FrameFocusSection
          handleFocusChange={props.handleFocusChange}
          localFocusSettings={props.localFocusSettings}
        />
      ) : null}
    </>
  );
}

function FrameBorderSection(props: {
  borderPresets: BorderPreset[];
  decorationEnabled: boolean;
  effectMode: EffectMode;
  handleAddPreset: () => void;
  handleDecorationToggle?: (showBorder: boolean) => void;
  handleEditPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId: string;
}) {
  const locale = useAppLocale();
  const enabledPresetCount = props.borderPresets.filter(
    (preset) => preset.enabled !== false
  ).length;
  return (
    <ContentPopoverSection
      className="sniptale-frame-style-section"
      title={translate('content.overlayControls.frameStyleLabel')}
    >
      {props.effectMode === 'border' ? null : (
        <ProductGlassToggleRow
          title={translate('content.overlayControls.showBorderTitle')}
          hint={translate('content.overlayControls.showBorderHint')}
          control={
            <ProductGlassSwitch
              onClick={() => props.handleDecorationToggle?.(!props.decorationEnabled)}
              on={props.decorationEnabled}
            />
          }
        />
      )}
      {props.decorationEnabled ? (
        <ProductGlassPresetList>
          {props.borderPresets.map((preset) => {
            const displayName = getBorderPresetDisplayName(preset, locale);
            const isEnabled = preset.enabled !== false;
            const isLastEnabled = isEnabled && enabledPresetCount <= 1;
            const isPending = props.pendingPresetIds.has(preset.id);
            const isSelected = props.selectedPresetId === preset.id;
            const visibilityActionLabel = translate(
              isLastEnabled
                ? 'highlighter.section.lastEnabledPresetDisabled'
                : isEnabled
                  ? 'content.overlayControls.hideFrameStyle'
                  : 'content.overlayControls.restoreFrameStyle'
            );

            return (
              <div
                className="sniptale-frame-style-preset-row"
                data-enabled={String(isEnabled)}
                key={preset.id}
              >
                <ProductGlassPresetItem
                  disabled={!isEnabled}
                  onClick={(event) => {
                    if (!createTrustedContentActionIntentSource(event.nativeEvent)) return;
                    props.handleSelectPreset(preset);
                  }}
                  active={isSelected}
                >
                  <ProductGlassPresetPreview style={getBorderPresetPreviewStyle(preset)} />
                  <ProductGlassPresetMeta>
                    <FramePresetName name={displayName} />
                  </ProductGlassPresetMeta>
                </ProductGlassPresetItem>
                <span className="sniptale-frame-style-preset-actions">
                  <button
                    aria-label={translate('content.overlayControls.configureFrameStyle')}
                    className="sniptale-frame-style-preset-action"
                    data-frame-style-action="edit"
                    disabled={isPending}
                    onClick={(event) => {
                      if (!createTrustedContentActionIntentSource(event.nativeEvent)) return;
                      props.handleEditPreset(preset);
                    }}
                    title={translate('content.overlayControls.configureFrameStyle')}
                    type="button"
                  >
                    <Settings2 size={15} />
                  </button>
                  <button
                    aria-label={visibilityActionLabel}
                    className="sniptale-frame-style-preset-action"
                    data-frame-style-action="toggle-visibility"
                    disabled={isPending || isLastEnabled}
                    onClick={(event) => {
                      if (!createTrustedContentActionIntentSource(event.nativeEvent)) return;
                      props.handleTogglePresetEnabled(preset);
                    }}
                    title={visibilityActionLabel}
                    type="button"
                  >
                    {isEnabled ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </div>
            );
          })}
        </ProductGlassPresetList>
      ) : null}
      {props.decorationEnabled ? (
        <button
          className="sniptale-frame-style-add"
          data-frame-style-action="add"
          onClick={(event) => {
            if (!createTrustedContentActionIntentSource(event.nativeEvent)) return;
            props.handleAddPreset();
          }}
          type="button"
        >
          <Plus size={15} />
          <span>{translate('content.overlayControls.addFrameStyle')}</span>
        </button>
      ) : null}
    </ContentPopoverSection>
  );
}

function FrameBlurSection(props: {
  handleBlurChange: (amount: number) => void;
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
        handleBlurTypeChange={props.handleBlurTypeChange}
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
  handleBlurTypeChange: (blurType: BlurType) => void;
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
    </ContentPopoverSection>
  );
}

function FrameFocusSection(props: {
  handleFocusChange: (opacity: number) => void;
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
    </ContentPopoverSection>
  );
}
