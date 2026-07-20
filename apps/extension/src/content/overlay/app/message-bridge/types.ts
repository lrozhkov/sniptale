import type { QuickActionOverlay } from '../../../../contracts/settings';
import type * as ContentActionContract from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { ScreenshotStartContext } from '../../screenshot/types';
import type {
  ContentAppQuickActionState,
  ContentAppRuntimeModeControls,
  QueueAutoStartCapture,
} from '../content-mode';

export type RuntimeMessageRequest = {
  type?: string;
  viewport?: { width: number; height: number } | null;
  quickActionOverlay?: QuickActionOverlay & { delaySeconds?: number };
  autoStartSelection?: boolean;
  autoStartCaptureType?: 'visible' | 'full';
  contentIntentGrant?: ContentActionContract.ContentPrivilegedActionAutoStartGrant;
  payload?: {
    type?: 'info' | 'success' | 'warning' | 'error';
    title?: string;
    message?: string;
  };
  seconds?: number;
  dataUrl?: string;
  filename?: string;
  html?: string;
  recordingId?: string;
  text?: string;
};

export type RuntimeMessageResponse = Record<string, unknown>;

type SaveDialogState = {
  dataUrl: string;
  filename: string;
};

type ScreenshotHandlerRef = {
  current: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>;
};

export interface RuntimeMessageBridgeModeState {
  aiPickMode: boolean;
  highlighterMode: boolean;
  isToolbarVisible: boolean;
  quickEditMode: boolean;
  screenshotMode: boolean;
}

export type RuntimeMessageBridgeModeControls = ContentAppRuntimeModeControls & {
  disableAiPickMode: () => void;
  disableHighlighterMode: () => void;
  disableQuickEditMode: () => void;
};

export type RuntimeMessageBridgeQuickActionControls = Pick<
  ContentAppQuickActionState,
  | 'captureAction'
  | 'captureActionRef'
  | 'quickActionOverlayRef'
  | 'setCaptureAction'
  | 'setQuickActionOverlay'
  | 'setQuickActionToastCountdown'
  | 'setTimerDelay'
>;

export interface RuntimeMessageBridgeViewportControls {
  clearPendingAutoStartCapture: () => void;
  handleTakeScreenshotRef: ScreenshotHandlerRef;
  invalidateScreenshotRuns: () => ScreenshotStartContext | undefined;
  queueAutoStartCapture: QueueAutoStartCapture;
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
}

export interface RuntimeMessageBridgeDialogControls {
  setSaveDialogState: (state: SaveDialogState | null) => void;
}

export interface RuntimeMessageBridgeDiagnosticControls {
  disableDiagnosticLogger: () => void;
  enableDiagnosticLogger: (recordingId: string) => void;
}

export interface RuntimeMessageBridgeParams {
  diagnostics: RuntimeMessageBridgeDiagnosticControls;
  dialogs: RuntimeMessageBridgeDialogControls;
  modeControls: RuntimeMessageBridgeModeControls;
  modeState: RuntimeMessageBridgeModeState;
  quickAction: RuntimeMessageBridgeQuickActionControls;
  viewport: RuntimeMessageBridgeViewportControls;
}
