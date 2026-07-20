import type { MutableRefObject } from 'react';

import type { CaptureActionType, QuickActionOverlay } from '../../../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../../../application/privileged-action-intent';
import type { PendingAutoStartCapture } from './pending-auto-start';
import type { ScreenshotStartContext } from '../../../screenshot/types';

export type ContentAppModeFlags = {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
  screenshotMode: boolean;
};

export type ContentAppQuickActionState = {
  captureAction: CaptureActionType;
  captureActionRef: MutableRefObject<CaptureActionType>;
  quickActionOverlayRef: MutableRefObject<QuickActionOverlay | null>;
  setCaptureAction: (action: CaptureActionType) => void;
  setQuickActionOverlay: (overlay: QuickActionOverlay | null) => void;
  setQuickActionToastCountdown: (seconds: number | null) => void;
  setTimerDelay: (delay: number) => void;
  timerDelay: number;
};

export type ContentAppViewportState = {
  currentViewport: { width: number; height: number } | null;
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
};

export type QueueAutoStartCapture = (
  type: 'visible' | 'full' | 'selection',
  contentIntentSource?: ContentPrivilegedActionIntentSource,
  startContext?: ScreenshotStartContext
) => void;

export type ContentAppVisibilityState = {
  isCompletelyHidden: boolean;
  isToolbarVisible: boolean;
  navigationLockEnabled: boolean;
  pinToTab: boolean;
  pendingAutoStartCapture: PendingAutoStartCapture | null;
  quickActionToastCountdown: number | null;
  saveDialogState: { dataUrl: string; filename: string } | null;
  sessionActivePresetId: string | null;
  clearPendingAutoStartCapture: () => void;
  queueAutoStartCapture: QueueAutoStartCapture;
  setIsCompletelyHidden: (hidden: boolean) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
  setPinToTab: (value: boolean) => void;
  setSaveDialogState: (state: { dataUrl: string; filename: string } | null) => void;
  setSessionActivePresetId: (presetId: string | null) => void;
};

export type ContentAppModeControls = {
  setAiPickMode: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditDocumentMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
  setScreenshotMode: (enabled: boolean) => void;
};

export type ContentAppRuntimeModeControls = ContentAppModeControls &
  Pick<ContentAppVisibilityState, 'setIsToolbarVisible' | 'setNavigationLockEnabled'>;
