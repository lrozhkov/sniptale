import type {
  RuntimePopupExportProgressMessage,
  RuntimePopupExportResultMessage,
  ScenarioCreateProjectMessage,
  ScenarioDeleteStepMessage,
  ScenarioGetRestoreSnapshotMessage,
  ScenarioGetSessionMessage,
  ScenarioListProjectsMessage,
  ScenarioMoveStepMessage,
  ScenarioOpenEditorMessage,
  ScenarioRecordSuggestedEventMessage,
  ScenarioRestoreStepMessage,
  ScenarioSaveCaptureStepMessage,
  ScenarioSetActiveProjectMessage,
  ScenarioSetCaptureModeMessage,
  ScenarioSetEnabledMessage,
  ScenarioSetSidebarVisibleMessage,
  ScenarioUpdateSessionPrefsMessage,
  ScenarioUpdateSurfaceStateMessage,
} from '../../../../../contracts/messaging/contracts/types';
import type { RuntimeRequestByType } from '../../../../../contracts/messaging/contracts/runtime-message';
import type {
  MessageType,
  TabModeMessage,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoControlMessage } from '../../../../../contracts/video/types/messages';
import type { RouteCaptureMessage } from '../../../../capture/routes';

export type BackgroundInternalSignalMessage =
  | { type: 'KEEP_ALIVE'; tabId?: number }
  | { type: VideoMessageType.COUNTDOWN_COMPLETE; tabId?: number }
  | RuntimePopupExportProgressMessage
  | RuntimePopupExportResultMessage;

export type ScenarioMessage =
  | ScenarioCreateProjectMessage
  | ScenarioDeleteStepMessage
  | ScenarioGetRestoreSnapshotMessage
  | ScenarioGetSessionMessage
  | ScenarioListProjectsMessage
  | ScenarioMoveStepMessage
  | ScenarioOpenEditorMessage
  | ScenarioRecordSuggestedEventMessage
  | ScenarioRestoreStepMessage
  | ScenarioSaveCaptureStepMessage
  | ScenarioSetActiveProjectMessage
  | ScenarioSetCaptureModeMessage
  | ScenarioSetEnabledMessage
  | ScenarioSetSidebarVisibleMessage
  | ScenarioUpdateSessionPrefsMessage
  | ScenarioUpdateSurfaceStateMessage;

export type BackgroundTabMessage =
  | RouteCaptureMessage
  | ScenarioMessage
  | PopupExportViewerMessage
  | TabModeMessage
  | VideoControlMessage;

export type PopupExportViewerMessage =
  | RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_PREVIEW]
  | RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_START]
  | RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
  | RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]
  | RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_CANCEL]
  | RuntimeRequestByType[typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT];

export type RuntimeMessageEnvelope = {
  type: string;
  tabId?: number;
};
