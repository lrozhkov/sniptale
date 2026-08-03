import type { CaptureActionType, ContentToolbarDisplayMode } from '../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { ToolbarMenuState } from './state/menu';
import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FocusSettings,
} from '../../../features/highlighter/contracts';

export type ToolbarViewportSelection = {
  presetId?: string;
  target?: 'viewport' | 'window';
  width: number;
  height: number;
} | null;

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
  onOpenSettings: () => void;
  onToggleAutoApply: () => Promise<void>;
}

export interface ToolbarFutureFrameStyle {
  blurSettings: BlurSettings;
  borderSettings: BorderPreset;
  effectMode: EffectMode;
  focusSettings: FocusSettings;
}

export interface ToolbarProps {
  captureAction?: CaptureActionType;
  onCaptureActionChange?: (action: CaptureActionType) => void;
  onToggleScreenshotMode: (enabled: boolean) => void;
  onToggleHighlighterMode: (enabled: boolean) => void;
  onToggleDesignReviewMode: (enabled: boolean) => void;
  onToggleQuickEditDocumentMode: (enabled: boolean) => void;
  onToggleQuickEditMode: (enabled: boolean) => void;
  onAiPickContentStart: () => void;
  aiPickMode?: boolean;
  designReviewMode?: boolean;
  designReviewPanelOpen?: boolean;
  highlighterMode?: boolean;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  screenshotMode?: boolean;
  isCursorMode?: boolean;
  pinToTab?: boolean;
  pinToTabAvailable?: boolean;
  pinToTabLocked?: boolean;
  onDisableAiPickMode?: () => void;
  onEnableCursorMode?: () => void;
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
