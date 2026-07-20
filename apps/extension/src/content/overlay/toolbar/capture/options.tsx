import React from 'react';
import {
  TvMinimal,
  GalleryVertical,
  Download,
  Copy,
  Pencil,
  FolderInput,
  FileStack,
  Save,
} from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { CaptureActionType } from '../../../../contracts/settings';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import { PopoverCheckIcon } from '../../icons/icons';
import type { ToolbarCaptureActionsProps } from '../types';

export function renderMenuCheck() {
  return <PopoverCheckIcon />;
}

export function getCaptureActionOptions() {
  return [
    {
      value: 'download_default' as const,
      label: translate('content.toolbar.captureDownloadLabel'),
      hint: translate('content.toolbar.captureDownloadHint'),
      icon: <Download className="sniptale-popover-icon" size={18} strokeWidth={2} />,
    },
    {
      value: 'ask_preset' as const,
      label: translate('content.toolbar.captureAskPresetLabel'),
      hint: translate('content.toolbar.captureAskPresetHint'),
      icon: <FolderInput className="sniptale-popover-icon" size={18} strokeWidth={2} />,
    },
    {
      value: 'ask_system' as const,
      label: translate('content.toolbar.captureAskSystemLabel'),
      hint: translate('content.toolbar.captureAskSystemHint'),
      icon: <Save className="sniptale-popover-icon" size={18} strokeWidth={2} />,
    },
    {
      value: 'copy' as const,
      label: translate('content.toolbar.captureCopyLabel'),
      hint: translate('content.toolbar.captureCopyHint'),
      icon: <Copy className="sniptale-popover-icon" size={18} strokeWidth={2} />,
    },
    {
      value: 'scenario' as const,
      label: translate('content.toolbar.captureScenarioLabel'),
      hint: translate('content.toolbar.captureScenarioHint'),
      icon: <FileStack className="sniptale-popover-icon" size={18} strokeWidth={2} />,
    },
    {
      value: 'edit' as const,
      label: translate('content.toolbar.captureEditLabel'),
      hint: translate('content.toolbar.captureEditHint'),
      icon: <Pencil className="sniptale-popover-icon" size={18} strokeWidth={2} />,
    },
  ] satisfies Array<{
    value: CaptureActionType;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }>;
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
  onTakeScreenshot: ToolbarCaptureActionsProps['onTakeScreenshot'];
}) {
  const handleTakeScreenshotClick = createTakeScreenshotClickHandler(props.onTakeScreenshot);

  return (
    <>
      <ToolbarViewportCaptureButton
        dataUi="content.toolbar.capture-visible-button"
        icon={<TvMinimal size={20} strokeWidth={2} />}
        onClick={handleTakeScreenshotClick('visible')}
        title={translate('content.toolbar.visibleArea')}
      />
      <ToolbarViewportCaptureButton
        dataUi="content.toolbar.capture-full-button"
        icon={<GalleryVertical size={20} strokeWidth={2} />}
        onClick={handleTakeScreenshotClick('full')}
        title={translate('content.toolbar.fullPage')}
      />
      <ToolbarSelectionCaptureButton onClick={handleTakeScreenshotClick('selection')} />
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
}) {
  return (
    <button
      onClick={props.onClick}
      className="sniptale-btn"
      title={props.title}
      data-ui={props.dataUi}
      data-sniptale-activation-bridge="defer"
    >
      {props.icon}
    </button>
  );
}

function ToolbarSelectionCaptureButton(props: {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      onClick={props.onClick}
      className="sniptale-btn"
      title={translate('content.toolbar.selectionArea')}
      data-ui="content.toolbar.capture-selection-button"
      data-sniptale-activation-bridge="defer"
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
