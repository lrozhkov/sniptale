import type { CaptureActionType, ContentToolbarDisplayMode } from '../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { ToolbarMenuState } from './state/menu';

export interface ToolbarCaptureActionsProps {
  screenshotMode: boolean;
  isLoading: boolean;
  captureAction: CaptureActionType;
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  pinToTab: boolean;
  pinToTabLocked: boolean;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
  onPinToTabChange: (value: boolean) => void;
  onCaptureActionChange: (action: CaptureActionType) => void;
  onCaptureActionCommitted?: (action: CaptureActionType) => Promise<void> | void;
  onClose: () => void;
  onDisableScreenshotMode: () => void;
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

export interface ToolbarProps {
  captureAction?: CaptureActionType;
  onCaptureActionChange?: (action: CaptureActionType) => void;
  onToggleScreenshotMode: (enabled: boolean) => void;
  onToggleHighlighterMode: (enabled: boolean) => void;
  onToggleQuickEditDocumentMode: (enabled: boolean) => void;
  onToggleQuickEditMode: (enabled: boolean) => void;
  pageStyleInspector?: {
    open: boolean;
    onToggle: () => void;
  };
  onAiPickContentStart: () => void;
  aiPickMode?: boolean;
  highlighterMode?: boolean;
  quickEditDocumentMode?: boolean;
  quickEditMode?: boolean;
  screenshotMode?: boolean;
  isCursorMode?: boolean;
  pinToTab?: boolean;
  pinToTabLocked?: boolean;
  onDisableAiPickMode?: () => void;
  onEnableCursorMode?: () => void;
  onPinToTabChange?: (value: boolean) => void;
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
  framesCount?: number;
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
