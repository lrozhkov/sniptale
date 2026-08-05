import { Droplet, Eye, EyeOff, Plus, Settings2, Square, Waves } from 'lucide-react';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { ProductToolbarMenuGroupLabel } from '@sniptale/ui/product-menus/toolbar';
import {
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassOptionGrid,
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
  ProductGlassPresetPreview,
  ProductGlassRange,
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
import { PresetNameWithOverflowHint } from '../../../ui/compact-inspector-controls/overflow-hint';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useState } from 'react';
import { BorderStyleInspector } from '../../../ui/highlighter-preset-editor/fields/inspector';
import { BorderManualSaveSettings } from '../../../ui/highlighter-preset-editor/fields/save-settings';
import type {
  AppliedBorderSettings,
  BorderVisualStylePatch,
} from '../../../features/highlighter/contracts';

function BlurTypeIcon(props: { iconName: 'droplet' | 'waves' | 'square' }) {
  if (props.iconName === 'droplet') {
    return <Droplet size={15} />;
  }

  if (props.iconName === 'waves') {
    return <Waves size={15} />;
  }

  return <Square size={15} />;
}

function getFrameEffectTitle(effectMode: EffectMode) {
  if (effectMode === 'border') return translate('content.interactiveFrame.effectBorder');
  if (effectMode === 'blur') return translate('content.interactiveFrame.effectBlur');
  return translate('content.interactiveFrame.effectFocus');
}

export function FrameSettingsPopoverContent(props: {
  compact?: boolean;
  effectMode: EffectMode;
  globalSettings: HighlighterSettings;
  handleBlurChange: (amount: number) => void;
  handleBlurShowBorderChange: (showBorder: boolean) => void;
  handleBlurTypeChange: (blurType: BlurType) => void;
  handleFocusChange: (opacity: number) => void;
  handleFocusShowBorderChange: (showBorder: boolean) => void;
  handleManualBorderChange: (patch: BorderVisualStylePatch) => void;
  handleAddPreset: () => void;
  handleEditPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  localBlurSettings: BlurSettings;
  localBorderSettings: AppliedBorderSettings;
  localFocusSettings: FocusSettings;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId?: string;
  manual: {
    cssDraft: string;
    cssError: string | null;
    isSaving: boolean;
    onCssDraftChange: (value: string) => void;
    save: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  };
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
      <ProductToolbarMenuGroupLabel>
        {getFrameEffectTitle(props.effectMode)}
      </ProductToolbarMenuGroupLabel>
      <FrameBorderSection
        borderPresets={props.globalSettings.borderPresets}
        decorationEnabled={decorationEnabled}
        effectMode={props.effectMode}
        handleAddPreset={props.handleAddPreset}
        handleEditPreset={props.handleEditPreset}
        handleManualBorderChange={props.handleManualBorderChange}
        handleSelectPreset={props.handleSelectPreset}
        handleTogglePresetEnabled={props.handleTogglePresetEnabled}
        pendingPresetIds={props.pendingPresetIds}
        localBorderSettings={props.localBorderSettings}
        manual={props.manual}
        {...(props.selectedPresetId === undefined
          ? {}
          : { selectedPresetId: props.selectedPresetId })}
        showDecorationHint={!props.compact}
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
  handleManualBorderChange: (patch: BorderVisualStylePatch) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId?: string;
  localBorderSettings: AppliedBorderSettings;
  manual: {
    cssDraft: string;
    cssError: string | null;
    isSaving: boolean;
    onCssDraftChange: (value: string) => void;
    save: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  };
  showDecorationHint: boolean;
}) {
  const locale = useAppLocale();
  const enabledPresetCount = props.borderPresets.filter(
    (preset) => preset.enabled !== false
  ).length;
  const [mode, setMode] = useState<'preset' | 'manual'>('preset');

  return (
    <ContentPopoverSection className="sniptale-frame-style-section">
      <FrameDecorationToggle {...props} />
      {props.decorationEnabled ? <FrameStyleModeSwitch mode={mode} onChange={setMode} /> : null}
      {props.decorationEnabled && mode === 'preset' ? (
        <FramePresetMode
          borderPresets={props.borderPresets}
          enabledPresetCount={enabledPresetCount}
          handleAddPreset={props.handleAddPreset}
          handleEditPreset={props.handleEditPreset}
          handleSelectPreset={props.handleSelectPreset}
          handleTogglePresetEnabled={props.handleTogglePresetEnabled}
          locale={locale}
          pendingPresetIds={props.pendingPresetIds}
          {...(props.selectedPresetId === undefined
            ? {}
            : { selectedPresetId: props.selectedPresetId })}
        />
      ) : null}
      {props.decorationEnabled && mode === 'manual' ? <FrameManualMode {...props} /> : null}
    </ContentPopoverSection>
  );
}

function FrameDecorationToggle(props: {
  decorationEnabled: boolean;
  effectMode: EffectMode;
  handleDecorationToggle?: (showBorder: boolean) => void;
  showDecorationHint: boolean;
}) {
  if (props.effectMode === 'border') return null;

  return (
    <ProductGlassToggleRow
      className="sniptale-frame-decoration-toggle-row"
      title={translate('content.overlayControls.showBorderTitle')}
      hint={
        props.showDecorationHint ? translate('content.overlayControls.showBorderHint') : undefined
      }
      control={
        <ProductGlassSwitch
          onClick={() => props.handleDecorationToggle?.(!props.decorationEnabled)}
          on={props.decorationEnabled}
        />
      }
    />
  );
}

function FrameStyleModeSwitch(props: {
  mode: 'preset' | 'manual';
  onChange: (mode: 'preset' | 'manual') => void;
}) {
  return (
    <SegmentedSwitch
      activeId={props.mode}
      ariaLabel={translate('content.overlayControls.frameStyleLabel')}
      onChange={props.onChange}
      options={[
        { id: 'preset', label: translate('content.overlayControls.frameStyleModePreset') },
        { id: 'manual', label: translate('content.overlayControls.frameStyleModeManual') },
      ]}
    />
  );
}

function FramePresetMode(props: {
  borderPresets: BorderPreset[];
  enabledPresetCount: number;
  handleAddPreset: () => void;
  handleEditPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  locale: ReturnType<typeof useAppLocale>;
  pendingPresetIds: ReadonlySet<string>;
  selectedPresetId?: string;
}) {
  return (
    <>
      <ProductGlassPresetList scrollable>
        {props.borderPresets.map((preset) => (
          <FramePresetRow
            enabledPresetCount={props.enabledPresetCount}
            handleEditPreset={props.handleEditPreset}
            handleSelectPreset={props.handleSelectPreset}
            handleTogglePresetEnabled={props.handleTogglePresetEnabled}
            key={preset.id}
            locale={props.locale}
            pending={props.pendingPresetIds.has(preset.id)}
            preset={preset}
            selected={props.selectedPresetId === preset.id}
          />
        ))}
      </ProductGlassPresetList>
      <button
        className="sniptale-frame-style-add"
        data-frame-style-action="add"
        onClick={(event) => {
          if (createTrustedContentActionIntentSource(event.nativeEvent)) props.handleAddPreset();
        }}
        type="button"
      >
        <Plus size={15} />
        <span>{translate('content.overlayControls.addFrameStyle')}</span>
      </button>
    </>
  );
}

function FramePresetRow(props: {
  enabledPresetCount: number;
  handleEditPreset: (preset: BorderPreset) => void;
  handleSelectPreset: (preset: BorderPreset) => void;
  handleTogglePresetEnabled: (preset: BorderPreset) => void;
  locale: ReturnType<typeof useAppLocale>;
  pending: boolean;
  preset: BorderPreset;
  selected: boolean;
}) {
  const displayName = getBorderPresetDisplayName(props.preset, props.locale);
  const isEnabled = props.preset.enabled !== false;
  const isLastEnabled = isEnabled && props.enabledPresetCount <= 1;
  const visibilityActionLabel = translate(
    isLastEnabled
      ? 'highlighter.section.lastEnabledPresetDisabled'
      : isEnabled
        ? 'content.overlayControls.hideFrameStyle'
        : 'content.overlayControls.restoreFrameStyle'
  );

  return (
    <div className="sniptale-frame-style-preset-row" data-enabled={String(isEnabled)}>
      <ProductGlassPresetItem
        active={props.selected}
        disabled={!isEnabled}
        onClick={(event) => {
          if (createTrustedContentActionIntentSource(event.nativeEvent)) {
            props.handleSelectPreset(props.preset);
          }
        }}
      >
        <ProductGlassPresetPreview style={getBorderPresetPreviewStyle(props.preset)} />
        <ProductGlassPresetMeta>
          <PresetNameWithOverflowHint name={displayName} />
        </ProductGlassPresetMeta>
      </ProductGlassPresetItem>
      <span className="sniptale-frame-style-preset-actions">
        <button
          aria-label={translate('content.overlayControls.configureFrameStyle')}
          className="sniptale-frame-style-preset-action"
          data-frame-style-action="edit"
          disabled={props.pending}
          onClick={(event) => {
            if (createTrustedContentActionIntentSource(event.nativeEvent)) {
              props.handleEditPreset(props.preset);
            }
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
          disabled={props.pending || isLastEnabled}
          onClick={(event) => {
            if (createTrustedContentActionIntentSource(event.nativeEvent)) {
              props.handleTogglePresetEnabled(props.preset);
            }
          }}
          title={visibilityActionLabel}
          type="button"
        >
          {isEnabled ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </div>
  );
}

function FrameManualMode(props: {
  borderPresets: BorderPreset[];
  handleManualBorderChange: (patch: BorderVisualStylePatch) => void;
  localBorderSettings: AppliedBorderSettings;
  manual: {
    cssDraft: string;
    cssError: string | null;
    isSaving: boolean;
    onCssDraftChange: (value: string) => void;
    save: (input: { name?: string; overwrite?: BorderPreset }) => Promise<boolean>;
  };
}) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--sniptale-color-border-soft)]">
      <BorderStyleInspector
        cssDraft={props.manual.cssDraft}
        cssError={props.manual.cssError}
        onChange={props.handleManualBorderChange}
        onCssDraftChange={props.manual.onCssDraftChange}
        saveSection={
          <BorderManualSaveSettings
            disabled={Boolean(props.manual.cssError)}
            isSaving={props.manual.isSaving}
            onSave={props.manual.save}
            presets={props.borderPresets}
          />
        }
        style={props.localBorderSettings}
      />
    </div>
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
    </ContentPopoverSection>
  );
}
