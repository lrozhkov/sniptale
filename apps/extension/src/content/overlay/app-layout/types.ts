import type { CaptureActionType } from '../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { ScreenshotStartContext } from '../screenshot/types';
import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { UseAiPickControllerResult } from '../ai/pick/controller/types';
import type { AutoBlurController } from '../auto-blur/controller';
import type { UseToolbarModeControllerResult } from '../toolbar/mode-controller/types';

type ContentAppAiController = Omit<UseAiPickControllerResult, 'handleCancelAIPrompt'> & {
  handleCancelAIPrompt?: UseAiPickControllerResult['handleCancelAIPrompt'];
};

export type ContentAppModeController = UseToolbarModeControllerResult;

type ContentAppModes = {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
  screenshotMode: boolean;
};

export type ContentAppScenarioActions = {
  applyCaptureAction: (actionType: CaptureActionType) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteRecentStep: (stepId: string) => Promise<void>;
  handleScreenshotModeDisabled: () => Promise<void>;
  moveRecentStep: (stepId: string, toIndex: number) => Promise<void>;
  openEditor: (stepId?: string | null) => Promise<void>;
  selectProject: (projectId: string | null) => Promise<void>;
  setCaptureMode: (captureMode: 'manual' | 'by-click') => Promise<void>;
  setRememberProjectSelection?: (value: boolean) => void;
  setSidebarVisible: (value: boolean) => void;
};

export type ContentAppScenarioState = {
  captureAction: CaptureActionType;
  pendingProjectSelection: boolean;
  projects: Array<{ id: string; name: string }>;
  recentStepHighlightToken: number;
  recentSteps: Array<{
    id: string;
    metadata?: {
      captureMetadata: ScenarioCaptureMetadata;
      captureSurface: ScenarioCaptureSurface;
      cursorPoint: ScenarioPoint | null;
      interactionPoint: ScenarioPoint | null;
      page: ScenarioPageDescriptor;
      sourceKind: ScenarioCaptureSourceKind;
      target: ScenarioTargetDescriptor | null;
    };
    previewDataUrl: string;
    title: string;
    position: number;
  }>;
  rememberProjectSelection?: boolean;
  scenarioCaptureMode: 'manual' | 'by-click';
  scenarioEnabled: boolean;
  scenarioProjectId: string | null;
  scenarioProjectName: string | null;
  sidebarVisible: boolean;
};

export type ContentAppSaveDialogState = { dataUrl: string; filename: string } | null;

export type ContentAppLayoutToolbarProps = {
  aiController: ContentAppAiController;
  autoBlurController: AutoBlurController;
  captureAction: CaptureActionType;
  currentViewport: { width: number; height: number } | null;
  frameCount: number;
  handleTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>;
  isCompletelyHidden: boolean;
  isCursorMode: boolean;
  isToolbarVisible: boolean;
  modeController: ContentAppModeController;
  modes: ContentAppModes;
  pageStyleInspector?: {
    open: boolean;
    onToggle: () => void;
  };
  pinToTab: boolean;
  setCaptureAction: (action: CaptureActionType) => void;
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
  setPinToTab: (value: boolean) => void;
  setTimerDelay: (delay: number) => void;
  timerDelay: number;
};

export type ContentAppLayoutDialogsProps = {
  aiController: ContentAppAiController;
  autoBlurController: AutoBlurController;
  countdown: number | null;
  handleCancelCountdown: () => void;
  quickActionToastCountdown: number | null;
  saveDialogState: ContentAppSaveDialogState;
  setSaveDialogState: (state: ContentAppSaveDialogState) => void;
  setSessionActivePresetId: (presetId: string | null) => void;
};

export type ContentAppLayoutScenarioProps = {
  actions: ContentAppScenarioActions;
  state: ContentAppScenarioState;
};

export interface ContentAppLayoutProps {
  dialogs: ContentAppLayoutDialogsProps;
  scenario: ContentAppLayoutScenarioProps;
  toolbar: ContentAppLayoutToolbarProps;
}
