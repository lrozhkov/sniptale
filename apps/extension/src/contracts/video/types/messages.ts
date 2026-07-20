import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  ContentVideoMessage,
  DesktopMediaCancelledMessage,
  DesktopMediaFailedMessage,
  DesktopMediaObtainedMessage,
  GetRecordingTabIdMessage,
  GetRecordingStateMessage,
  RegisterCameraRecorderControlMessage,
} from '@sniptale/runtime-contracts/video/types/messages.content';
import type {
  RecordingDurationUpdatedMessage,
  VideoControlMessage,
} from '@sniptale/runtime-contracts/video/types/messages.control';
import type {
  CancelProjectExportMessage,
  GetProjectExportCapabilitiesMessage,
  ProjectExportCancelledMessage,
  ProjectExportCompletedMessage,
  ProjectExportFailedMessage,
  ProjectExportProgressMessage,
  StartProjectExportMessage,
} from './messages.export.ts';
import type {
  OffscreenErrorMessage,
  OffscreenRecordingPausedMessage,
  OffscreenRecordingResumedMessage,
  OffscreenRecordingStartedMessage,
  OffscreenRecordingStoppedMessage,
} from './messages.offscreen.ts';

export type * from '@sniptale/runtime-contracts/video/types/messages.content';
export type * from '@sniptale/runtime-contracts/video/types/messages.control';
export type * from './messages.export.ts';
export type * from './messages.offscreen.ts';

export type VideoRuntimeMessage =
  | GetRecordingStateMessage
  | RegisterCameraRecorderControlMessage
  | GetRecordingTabIdMessage
  | RecordingDurationUpdatedMessage
  | OffscreenRecordingStartedMessage
  | OffscreenRecordingStoppedMessage
  | OffscreenRecordingPausedMessage
  | OffscreenRecordingResumedMessage
  | OffscreenErrorMessage
  | StartProjectExportMessage
  | CancelProjectExportMessage
  | GetProjectExportCapabilitiesMessage
  | ProjectExportProgressMessage
  | ProjectExportCompletedMessage
  | ProjectExportFailedMessage
  | ProjectExportCancelledMessage
  | {
      type: typeof VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS;
      event?: string;
      level?: string;
      payload?: unknown;
      recordingId?: string;
    }
  | { type: typeof VideoMessageType.OFFSCREEN_READY; offscreenStartupId: string }
  | { type: typeof VideoMessageType.CAPTURE_SOURCE_OBTAINED }
  | DesktopMediaObtainedMessage
  | DesktopMediaCancelledMessage
  | DesktopMediaFailedMessage
  | {
      type: typeof VideoMessageType.VIDEO_SAVED_TO_IDB;
      filename?: string;
      recordingId: string;
      projectId?: string;
    }
  | {
      type: typeof VideoMessageType.DOWNLOAD_RECORDING;
      recordingId: string;
      filename: string;
      url?: never;
    }
  | {
      type: typeof VideoMessageType.DOWNLOAD_RECORDING_SIDECAR;
      content: string;
      filename: string;
      mimeType: string;
    };

export type { ContentVideoMessage, VideoControlMessage };
