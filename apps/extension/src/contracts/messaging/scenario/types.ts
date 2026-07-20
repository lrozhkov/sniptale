import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ScenarioCaptureMode,
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
  ScenarioSuggestedEventKind,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../features/scenario/contracts/types/project';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioRestoreSnapshot,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';

export type ScenarioRuntimeCapturePayload = {
  captureSurface: ScenarioCaptureSurface;
  sourceKind: ScenarioCaptureSourceKind;
  page: ScenarioPageDescriptor;
  target?: ScenarioTargetDescriptor | null;
  interactionPoint?: ScenarioPoint | null;
  cursorPoint?: ScenarioPoint | null;
  captureMetadata?: ScenarioCaptureMetadata;
  title?: string;
  body?: string;
};

export type ScenarioGetSessionMessage = {
  type: MessageType.SCENARIO_GET_SESSION;
  tabId?: number;
};

export type ScenarioSetEnabledMessage = {
  type: MessageType.SCENARIO_SET_ENABLED;
  enabled: boolean;
  tabId?: number;
};

export type ScenarioGetRestoreSnapshotMessage = {
  type: MessageType.SCENARIO_GET_RESTORE_SNAPSHOT;
  tabId?: number;
};

export type ScenarioSetCaptureModeMessage = {
  type: MessageType.SCENARIO_SET_CAPTURE_MODE;
  captureMode: ScenarioCaptureMode;
  tabId?: number;
};

export type ScenarioSetSidebarVisibleMessage = {
  type: MessageType.SCENARIO_SET_SIDEBAR_VISIBLE;
  sidebarVisible: boolean;
  tabId?: number;
};

export type ScenarioUpdateSurfaceStateMessage = {
  type: MessageType.SCENARIO_UPDATE_SURFACE_STATE;
  surface: ScenarioRecorderSurfaceState;
  tabId?: number;
};

export type ScenarioUpdateSessionPrefsMessage = {
  type: MessageType.SCENARIO_UPDATE_SESSION_PREFS;
  rememberProjectSelection: boolean;
  tabId?: number;
};

export type ScenarioSetActiveProjectMessage = {
  type: MessageType.SCENARIO_SET_ACTIVE_PROJECT;
  projectId: string | null;
  rememberProjectSelection?: boolean;
  tabId?: number;
};

export type ScenarioListProjectsMessage = {
  type: MessageType.SCENARIO_LIST_PROJECTS;
};

export type ScenarioCreateProjectMessage = {
  type: MessageType.SCENARIO_CREATE_PROJECT;
  name: string;
  tabId?: number;
  rememberProjectSelection?: boolean;
};

export type ScenarioSaveCaptureStepMessage = {
  type: MessageType.SCENARIO_SAVE_CAPTURE_STEP;
  dataUrl: string;
  filename: string;
  galleryAssetId?: string | null;
  tabId?: number;
} & ScenarioRuntimeCapturePayload;

export type ScenarioDeleteStepMessage = {
  type: MessageType.SCENARIO_DELETE_STEP;
  projectId: string;
  stepId: string;
  tabId?: number;
};

export type ScenarioMoveStepMessage = {
  type: MessageType.SCENARIO_MOVE_STEP;
  projectId: string;
  stepId: string;
  toIndex: number;
  tabId?: number;
};

export type ScenarioRestoreStepMessage = {
  type: MessageType.SCENARIO_RESTORE_STEP;
  projectId: string;
  stepId: string;
  tabId?: number;
};

export type ScenarioRecordSuggestedEventMessage = {
  type: MessageType.SCENARIO_RECORD_SUGGESTED_EVENT;
  kind: ScenarioSuggestedEventKind;
  message: string;
  target?: ScenarioTargetDescriptor | null;
  sourceStepId?: string | null;
  data?: Record<string, string | number | boolean | null>;
  tabId?: number;
};

export type ScenarioOpenEditorMessage = {
  type: MessageType.SCENARIO_OPEN_EDITOR;
  projectId?: string | null;
  stepId?: string | null;
};

export type ScenarioSessionPayload = {
  session?: ScenarioSessionState;
  surface?: ScenarioRecorderSurfaceState;
  projects?: ScenarioProjectSummary[];
  recentSteps?: ScenarioRecentStep[];
  trashedSteps?: ScenarioTrashedStep[];
  projectRevision?: number;
  snapshot?: ScenarioRestoreSnapshot;
};
