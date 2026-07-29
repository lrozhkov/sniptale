import React from 'react';
import { TvMinimal, Download, Copy, Pencil, FolderInput, FileStack, Save } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { CaptureActionType } from '../../../../contracts/settings';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import { PopoverCheckIcon } from '../../icons/icons';
import type { ToolbarCaptureActionsProps } from '../types';
import { getCaptureActionDescriptors } from '../../../../features/quick-actions-presets/catalog';
import { FullPageCaptureSplitButton } from './full-page-menu';
import { useFullPageCapturePreferences } from './full-page-preferences';

export function renderMenuCheck() {
  return <PopoverCheckIcon />;
}

export function getCaptureActionOptions() {
  return getCaptureActionDescriptors().map((option) => ({
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
      return <FileStack {...iconProps} />;
    case 'edit':
      return <Pencil {...iconProps} />;
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
      return <FileStack {...iconProps} />;
    case 'edit':
      return <Pencil {...iconProps} />;
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

  return (
    <>
      <ToolbarViewportCaptureButton
        dataUi="content.toolbar.capture-visible-button"
        icon={<TvMinimal size={20} strokeWidth={2} />}
        onClick={handleTakeScreenshotClick('visible')}
        title={translate('content.toolbar.visibleArea')}
        disabled={props.isLoading}
      />
      <ToolbarSelectionCaptureButton
        disabled={props.isLoading}
        onClick={handleTakeScreenshotClick('selection')}
      />
      <FullPageCaptureSplitButton
        compactMenus={props.compactMenus}
        currentViewport={props.currentViewport}
        disabled={props.isLoading}
        displayMode={props.displayMode}
        onPrimaryClick={handleTakeScreenshotClick('full')}
        onUpdate={fullPage.updatePreferences}
        preferences={fullPage.preferences}
        saving={fullPage.saving}
        toolbarMenuState={props.toolbarMenuState}
      />
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

function ToolbarViewportCaptureButton(props: {
  dataUi: string;
  icon: React.ReactNode;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  title: string;
  disabled: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      className="sniptale-btn"
      title={props.title}
      data-ui={props.dataUi}
      data-sniptale-activation-bridge="defer"
      disabled={props.disabled}
    >
      {props.icon}
    </button>
  );
}

function ToolbarSelectionCaptureButton(props: {
  disabled: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      onClick={props.onClick}
      className="sniptale-btn"
      title={translate('content.toolbar.selectionArea')}
      data-ui="content.toolbar.capture-selection-button"
      data-sniptale-activation-bridge="defer"
      disabled={props.disabled}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
      </svg>
    </button>
  );
}
