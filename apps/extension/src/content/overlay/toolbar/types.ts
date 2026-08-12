import type { CaptureActionType, ContentToolbarDisplayMode } from '../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { ToolbarMenuState } from './state/menu';
import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
} from '../../../features/highlighter/contracts';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { ContentDrawingController } from '../../drawing/controller';
import type {
  VideoRecordingToolbarInteraction,
  VideoRecordingToolbarState,
} from '../video-recording/session/state';
import type {
  RecordingDrawingAutoHideDelay,
  RecordingDrawingOwner,
} from './video-recording/drawing-session';
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';

export interface ToolbarVideoRecordingProps {
  drawingOwner: RecordingDrawingOwner;
  state: VideoRecordingToolbarState;
  onActivate: (activationEvent?: Event) => Promise<boolean> | boolean;
  onCancelStart: () => Promise<void> | void;
  onCameraEnabledChange: (enabled: boolean) => Promise<void> | void;
  onCameraDeviceChange?: (deviceId: string) => Promise<void> | void;
  onCameraGeometryChange: (
    appearance: Pick<
      ToolbarVideoRecordingProps['state']['webcamPresentation'],
      'shape' | 'center' | 'sizeFraction' | 'cropOffset'
    >
  ) => Promise<void> | void;
  onCameraOffer: (sdp: string) => Promise<string>;
  onCameraPeerClose: () => Promise<void> | void;
  onDeactivate: () => Promise<boolean> | boolean;
  onAutoHideDelayChange?: (delay: RecordingDrawingAutoHideDelay) => Promise<void> | void;
  onInteractionChange: (interaction: VideoRecordingToolbarInteraction) => void;
  onMicrophoneEnabledChange: (enabled: boolean) => Promise<void> | void;
  onMicrophoneDeviceChange?: (deviceId: string) => Promise<void> | void;
  onLoadMediaDevices?: (kind: 'audioinput' | 'videoinput') => Promise<VideoRecordingMediaDevice[]>;
  onPause: () => Promise<void> | void;
  onResume: () => Promise<void> | void;
  onSpotlightEnabledChange: (enabled: boolean) => Promise<void> | void;
  onSpotlightSettingsChange?: (settings: {
    cursorHaloEnabled: boolean;
    cursorDimmingEnabled: boolean;
    clickAnimationEnabled: boolean;
  }) => Promise<void> | void;
  onStart: (activationEvent?: Event) => Promise<void> | void;
  onStop: () => Promise<void> | void;
}

export type ToolbarViewportSelection = {
  presetId?: string;
  target?: 'viewport' | 'window';
  width: number;
  height: number;
} | null;

export type ToolbarPageEditingMode = 'block-selection' | 'direct-text' | 'ai';

export interface ToolbarCaptureActionsProps {
  screenshotMode: boolean;
  isLoading: boolean;
  captureAction: CaptureActionType;
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  pinToTabLocked: boolean;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
  onPinToTabChange: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onCaptureActionCommitted?: (action: CaptureActionType) => Promise<void> | void;
  onClose: () => void;
  onDisableScreenshotMode: (activationEvent?: Event) => void;
  timerDelay: number;
  onTimerDelayChange: (delay: number) => void;
  currentViewport: { width: number; height: number } | null;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
  toolbarMenuState: ToolbarMenuState;
  onTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  scenario?: ToolbarProps['scenario'];
}

export interface ToolbarAutoBlurProps {
  autoApplyAllowed: boolean;
  autoApplyEnabled: boolean;
  isApplying: boolean;
  onApplyOnce: () => Promise<void>;
  onOpenAutoApplySettings: () => void;
  onOpenSettings: () => void;
  onToggleAutoApply: () => Promise<void>;
}

export interface ToolbarFutureFrameStyle {
  blurSettings: BlurSettings;
  borderSettings: AppliedBorderSettings;
  effectMode: EffectMode;
  focusSettings: FocusSettings;
  futureCallout?: CalloutSettings | null;
  futureStepBadge?: StepBadgeSettings | null;
}

export interface ToolbarFutureFrameCalloutActions {
  enable: () => CalloutSettings;
  set: (settings: CalloutSettings | null) => void;
}

export interface ToolbarFutureFrameStepBadgeActions {
  enable: () => StepBadgeSettings;
  set: (settings: StepBadgeSettings | null) => void;
}

export interface ToolbarProps {
  captureAction?: CaptureActionType;
  onCaptureActionChange?: (action: CaptureActionType) => void;
  onToggleScreenshotMode: (enabled: boolean) => void;
  onToggleHighlighterMode: (enabled: boolean) => void;
  onToggleDesignReviewMode: (enabled: boolean) => void;
  onToggleDrawingMode?: (enabled: boolean) => void;
  onToggleQuickEditDocumentMode: (enabled: boolean) => void;
  onToggleQuickEditMode: (enabled: boolean) => void;
  onAiPickContentStart: () => void;
  aiPickMode?: boolean;
  designReviewMode?: boolean;
  drawingMode?: boolean;
  drawingController?: ContentDrawingController;
  designReviewPanelOpen?: boolean;
  highlighterMode?: boolean;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  screenshotMode?: boolean;
  videoRecordingMode?: boolean;
  videoRecording?: ToolbarVideoRecordingProps;
  isCursorMode?: boolean;
  pinToTab?: boolean;
  pinToTabAvailable?: boolean;
  pinToTabLocked?: boolean;
  onDisableAiPickMode?: () => void;
  onEnableCursorMode?: () => void;
  onToggleVideoRecordingMode?: (
    enabled: boolean,
    activationEvent?: Event
  ) => Promise<boolean> | boolean | void;
  onToggleDesignReviewPanel?: () => void;
  onPinToTabChange?: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  onTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  onHide: () => void;
  onClearHighlights: () => void;
  onClearPagePreparation?: () => void;
  canClearPagePreparation?: boolean;
  autoBlur?: ToolbarAutoBlurProps;
  onToggleNavigationLock?: (enabled: boolean) => void;
  timerDelay: number;
  onTimerDelayChange: (delay: number) => void;
  currentViewport?: { width: number; height: number } | null;
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
  mutateViewport?: (viewport: ToolbarViewportSelection) => Promise<void>;
  framesCount?: number;
  futureFrameStyle?: ToolbarFutureFrameStyle;
  onFutureFrameEffectModeChange?: (mode: EffectMode) => void;
  futureFrameCalloutActions?: ToolbarFutureFrameCalloutActions;
  futureFrameStepBadgeActions?: ToolbarFutureFrameStepBadgeActions;
  scenario?: {
    byClickDisabled: boolean;
    captureMode: 'manual' | 'by-click';
    enabled: boolean;
    onCaptureActionSelected: (action: CaptureActionType) => Promise<void> | void;
    onCreateProject: (name: string) => Promise<void> | void;
    onFinishScenario: () => Promise<void> | void;
    onOpenEditor: (stepId?: string | null) => void;
    onProjectSelect: (projectId: string) => Promise<void> | void;
    onRememberProjectSelectionChange?: (value: boolean) => Promise<void> | void;
    onSetCaptureMode: (captureMode: 'manual' | 'by-click') => void;
    onToggleSidebar: () => void;
    projectId: string | null;
    projectName: string | null;
    projects: Array<{ id: string; name: string }>;
    pendingProjectSelection: boolean;
    rememberProjectSelection?: boolean;
    sidebarVisible: boolean;
  };
}
