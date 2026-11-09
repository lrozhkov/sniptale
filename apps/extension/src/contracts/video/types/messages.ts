import type { RecordingTelemetrySnapshot } from '../../messaging/contracts/response-types';
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
  OffscreenSourceReadyMessage,
} from './messages.offscreen.ts';

export type * from '@sniptale/runtime-contracts/video/types/messages.content';
export type * from '@sniptale/runtime-contracts/video/types/messages.control';
export type * from './messages.export.ts';
export type * from './messages.offscreen.ts';

export type RecordingObservationsMessage = {
  type: typeof VideoMessageType.RECORDING_OBSERVATIONS;
  recordingId: string;
} & (
  | { telemetry: RecordingTelemetrySnapshot; cursorPacket?: never; eventPacket?: never }
  | {
      cursorPacket: import('../cursor-observations').RecordingCursorObservationPacket;
      telemetry?: never;
      eventPacket?: never;
    }
  | {
      eventPacket: import('../event-observations').RecordingEventObservationPacket;
      telemetry?: never;
      cursorPacket?: never;
    }
);

export type VideoRuntimeMessage =
  | RecordingObservationsMessage
  | GetRecordingStateMessage
  | {
      type: typeof VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT;
      recordingId: string;
    }
  | RegisterCameraRecorderControlMessage
  | GetRecordingTabIdMessage
  | RecordingDurationUpdatedMessage
  | OffscreenRecordingStartedMessage
  | OffscreenSourceReadyMessage
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
      primaryRecordingId: string;
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
      type: typeof VideoMessageType.DOWNLOAD_PROJECT_EXPORT;
      exportId: string;
      filename: string;
    }
  | {
      type: typeof VideoMessageType.DOWNLOAD_RECORDING_SIDECAR;
      content: string;
      filename: string;
      mimeType: string;
    };

export type { ContentVideoMessage, VideoControlMessage };
