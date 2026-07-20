import type { CaptureActionType } from '../../../contracts/settings';
import type {
  ScenarioCaptureMode,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../features/scenario/contracts/types/project';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';

export function buildScenarioControllerViewState(args: {
  buildCapturePayload: (
    captureSurface: ScenarioCaptureSurface,
    sourceKind: 'manual' | 'auto-click'
  ) => ScenarioRuntimeCapturePayload | null;
  captureAction: CaptureActionType;
  effectiveSession: ScenarioSessionState;
  projects: ScenarioProjectSummary[];
  recentSteps: ScenarioRecentStep[];
  recentStepHighlightToken: number;
  trashedSteps: ScenarioTrashedStep[];
  refreshSession: () => Promise<void>;
  saveSelectionCapture: (dataUrl: string, captureSurface: ScenarioCaptureSurface) => Promise<void>;
  sidebarVisible: boolean;
}) {
  return {
    buildManualCapturePayload: (captureSurface: ScenarioCaptureSurface) =>
      args.buildCapturePayload(captureSurface, 'manual'),
    captureAction: args.captureAction,
    pendingProjectSelection: args.effectiveSession.pendingProjectSelection,
    projects: args.projects,
    recentStepHighlightToken: args.recentStepHighlightToken,
    recentSteps: args.recentSteps,
    refreshSession: args.refreshSession,
    saveSelectionCapture: args.saveSelectionCapture,
    scenarioCaptureMode: args.effectiveSession.captureMode as ScenarioCaptureMode,
    scenarioEnabled: args.effectiveSession.enabled,
    scenarioProjectId: args.effectiveSession.projectId,
    scenarioProjectName: args.effectiveSession.projectName,
    rememberProjectSelection: args.effectiveSession.rememberProjectSelection,
    sidebarVisible: args.sidebarVisible,
    trashedSteps: args.trashedSteps,
  };
}
