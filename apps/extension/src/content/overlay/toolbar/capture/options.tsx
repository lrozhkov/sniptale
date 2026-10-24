import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import React from 'react';
import { Copy, Crop, Download, FolderInput, Library, Save } from 'lucide-react';
import { PageControlVisibility } from '../controls/control-visibility';
import { translate } from '../../../../platform/i18n';
import type { CaptureActionType } from '../../../../contracts/settings';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import { PopoverCheckIcon } from '../../icons/icons';
import type { ToolbarCaptureActionsProps } from '../types';
import { getCaptureActionDescriptors } from '../../../../features/quick-actions-presets/catalog';
import { FullPageCaptureSplitButton } from './full-page-menu';
import { CaptureActionIcons } from './action-icons';
import { ScreenshotCaptureSplitButton } from './screenshot-menu';
import { NumericRow, SegmentedRow } from '../../../../ui/compact-inspector-controls';
import { useToolbarImagePreferences } from './image-preferences';
import { useFullPageCapturePreferences } from './full-page-preferences';
import { ImageEditorIcon, ScenarioEditorIcon } from '@sniptale/ui/editor-chrome';

export function renderMenuCheck() {
  return <PopoverCheckIcon />;
}

export function getCaptureActionOptions() {
  return getCaptureActionDescriptors()
    .filter((option) => option.value !== 'scenario')
    .map((option) => ({
      ...option,
      icon: getCaptureActionMenuIcon(option.value),
    })) satisfies Array<{
    value: CaptureActionType;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }>;
}

function getCaptureActionMenuIcon(captureAction: CaptureActionType) {
  const iconProps = { className: 'sniptale-popover-icon', size: 18, strokeWidth: 2 };
  switch (captureAction) {
    case 'ask_preset':
      return <FolderInput {...iconProps} />;
    case 'ask_system':
      return <Save {...iconProps} />;
    case 'copy':
      return <Copy {...iconProps} />;
    case 'scenario':
      return <ScenarioEditorIcon className="sniptale-popover-icon" />;
    case 'edit':
      return <ImageEditorIcon className="sniptale-popover-icon" />;
    case 'save_to_library':
      return <Library {...iconProps} />;
    case 'download_default':
    default:
      return <Download {...iconProps} />;
  }
}

export function getTimerOptions() {
  return [
    {
      value: 0,
      label: translate('content.toolbar.timerNoneLabel'),
      hint: translate('content.toolbar.timerNoneHint'),
    },
    {
      value: 3,
      label: translate('content.toolbar.timerThreeLabel'),
      hint: translate('content.toolbar.timerThreeHint'),
    },
    {
      value: 5,
      label: translate('content.toolbar.timerFiveLabel'),
      hint: translate('content.toolbar.timerFiveHint'),
    },
    {
      value: 10,
      label: translate('content.toolbar.timerTenLabel'),
      hint: translate('content.toolbar.timerTenHint'),
    },
  ] as const;
}

export function getCaptureActionIcon(captureAction: CaptureActionType) {
  const iconProps = { size: 20, strokeWidth: 2 };
  switch (captureAction) {
    case 'copy':
      return <Copy {...iconProps} />;
    case 'scenario':
      return <ScenarioEditorIcon />;
    case 'edit':
      return <ImageEditorIcon />;
    case 'save_to_library':
      return <Library {...iconProps} />;
    case 'ask_preset':
      return <FolderInput {...iconProps} />;
    case 'ask_system':
      return <Save {...iconProps} />;
    case 'download_default':
    default:
      return <Download {...iconProps} />;
  }
}

export function getCaptureActionTooltip(captureAction: CaptureActionType) {
  switch (captureAction) {
    case 'copy':
      return translate('content.toolbar.afterCaptureCopy');
    case 'scenario':
      return translate('content.toolbar.afterCaptureScenario');
    case 'edit':
      return translate('content.toolbar.afterCaptureEdit');
    case 'save_to_library':
      return translate('content.toolbar.afterCaptureSaveToLibrary');
    case 'ask_preset':
      return translate('content.toolbar.afterCaptureAskPreset');
    case 'ask_system':
      return translate('content.toolbar.afterCaptureAskSystem');
    case 'download_default':
    default:
      return translate('content.toolbar.afterCaptureDownload');
  }
}

export function ToolbarCaptureButtons(props: {
  compactMenus: boolean;
  currentViewport: { height: number; width: number } | null;
  displayMode: 'horizontal' | 'vertical';
  isLoading: boolean;
  onTakeScreenshot: ToolbarCaptureActionsProps['onTakeScreenshot'];
  toolbarMenuState: ToolbarCaptureActionsProps['toolbarMenuState'];
}) {
  const handleTakeScreenshotClick = createTakeScreenshotClickHandler(props.onTakeScreenshot);
  const fullPage = useFullPageCapturePreferences();
  const image = useToolbarImagePreferences();
  const disabled = props.isLoading || image.saving || fullPage.saving;
  const quickActions = (mode: 'visible' | 'full') => (
    <CaptureActionIcons
      label={translate('content.toolbar.captureQuickActionsTitle')}
      dataUiPrefix={`content.toolbar.capture-${mode}-action`}
      options={getCaptureActionOptions()}
      disabled={disabled}
      onSelect={(action, event) => {
        const source = createTrustedContentActionIntentSource(event.nativeEvent);
        if (!source) return;
        props.toolbarMenuState.closeMenus();
        props.onTakeScreenshot(mode, source, { captureAction: action });
      }}
    />
  );
  const imageParameters = <CaptureImageParameters image={image} />;

  return (
    <>
      <PageControlVisibility
        control="capture-visible"
        label={translate('content.toolbar.visibleArea')}
      >
        <ScreenshotCaptureSplitButton
          mode="visible"
          compactMenus={props.compactMenus}
          displayMode={props.displayMode}
          disabled={disabled}
          onPrimaryClick={handleTakeScreenshotClick('visible')}
          toolbarMenuState={props.toolbarMenuState}
          quickActions={quickActions('visible')}
        >
          {imageParameters}
        </ScreenshotCaptureSplitButton>
      </PageControlVisibility>
      <PageControlVisibility control="capture-full" label={translate('content.toolbar.fullPage')}>
        <FullPageCaptureSplitButton
          compactMenus={props.compactMenus}
          currentViewport={props.currentViewport}
          disabled={disabled}
          displayMode={props.displayMode}
          onPrimaryClick={handleTakeScreenshotClick('full')}
          onUpdate={fullPage.updatePreferences}
          quickActions={quickActions('full')}
          imageParameters={imageParameters}
          preferences={fullPage.preferences}
          saving={fullPage.saving}
          toolbarMenuState={props.toolbarMenuState}
        />
      </PageControlVisibility>
      <PageControlVisibility
        control="capture-selection"
        label={translate('content.toolbar.selectionArea')}
      >
        <ToolbarSelectionCaptureButton
          disabled={disabled}
          onClick={handleTakeScreenshotClick('selection')}
        />
      </PageControlVisibility>
    </>
  );
}

function createTakeScreenshotClickHandler(
  onTakeScreenshot: ToolbarCaptureActionsProps['onTakeScreenshot']
) {
  return (type: 'visible' | 'full' | 'selection') =>
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const contentIntentSource = createTrustedContentActionIntentSource(event.nativeEvent);
      if (!contentIntentSource) {
        return;
      }
      onTakeScreenshot(type, contentIntentSource);
    };
}

function CaptureImageParameters({
  image,
}: {
  image: ReturnType<typeof useToolbarImagePreferences>;
}) {
  const [quality, setQuality] = React.useState(image.imageQuality);
  React.useEffect(() => {
    if (!image.saving) setQuality(image.imageQuality);
  }, [image.imageQuality, image.saving]);
  return (
    <div className="sniptale-capture-image-parameters">
      <span className="sniptale-capture-parameter-label">
        {translate('imageSettings.section.formatLabel')}
      </span>
      <SegmentedRow
        ariaLabel={translate('imageSettings.section.formatLabel')}
        value={image.imageFormat}
        options={[
          { value: 'png', label: translate('imageSettings.section.formatPngLabel') },
          { value: 'jpeg', label: translate('imageSettings.section.formatJpegLabel') },
          { value: 'webp', label: translate('imageSettings.section.formatWebpLabel') },
        ]}
        onChange={(imageFormat) => void image.updatePreferences({ imageFormat })}
      />
      {image.imageFormat !== 'png' ? (
        <NumericRow
          appearance="plain"
          label={translate('imageSettings.section.qualityLabel')}
          value={quality}
          min={1}
          max={100}
          step={1}
          unit="%"
          revealScrub
          scrub={{ min: 1, max: 100, step: 1 }}
          onPreviewValue={setQuality}
          onCommitValue={(imageQuality) => {
            setQuality(imageQuality);
            void image.updatePreferences({ imageQuality });
          }}
        />
      ) : null}
    </div>
  );
}

function ToolbarSelectionCaptureButton(props: {
  disabled: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <ContentToolbarButton
      type="button"
      tone="property"
      data-content-command="true"
      onClick={props.onClick}
      title={translate('content.toolbar.selectionArea')}
      dataUi="content.toolbar.capture-selection-button"
      data-sniptale-activation-bridge="defer"
      disabled={props.disabled}
    >
      <Crop size={20} strokeWidth={2} />
    </ContentToolbarButton>
  );
}
