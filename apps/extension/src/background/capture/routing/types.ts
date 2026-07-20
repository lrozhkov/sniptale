import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { CaptureActionType } from '../../../contracts/settings';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import type { WebSnapshotViewerPorts } from '../page-preparation/viewer-ports';

export type ViewportState = Map<number, { width: number; height: number } | null>;

export type CaptureGuardState = { isCapturing: boolean };

export type SendResponse = ResponseSender;

export type CaptureRouteContext = {
  message?: Partial<RouteCaptureMessage> &
    Record<string, unknown> & {
      actionType?: CaptureActionType;
      scenarioCapture?: ScenarioRuntimeCapturePayload;
    };
  resolvedTabId: number;
  sendResponse: SendResponse;
  viewportState: ViewportState;
  screenshotModeState: Map<number, boolean>;
  captureGuardState: CaptureGuardState;
  pageAccessPort?: PageAccessPort | undefined;
  scenarioSessionService: ScenarioSessionService;
  webSnapshotViewerPorts?: WebSnapshotViewerPorts | undefined;
};

export type RouteCaptureMessage =
  | {
      type: 'CAPTURE_VISIBLE';
      actionType?: CaptureActionType;
      contentIntent?: ContentPrivilegedActionCapability;
      scenarioCapture?: ScenarioRuntimeCapturePayload;
    }
  | {
      type: 'CAPTURE_FULL';
      actionType?: CaptureActionType;
      contentIntent?: ContentPrivilegedActionCapability;
      scenarioCapture?: ScenarioRuntimeCapturePayload;
    }
  | {
      type: 'CAPTURE_VISIBLE_FOR_CROP';
      actionType?: CaptureActionType;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'EXECUTE_SAVE';
      dataUrl: string;
      filename: string;
      actionType: CaptureActionType;
      contentIntent?: ContentPrivilegedActionCapability;
      presetId?: string | null;
    }
  | {
      type: 'REQUEST_EXPORT_HAR_START_CAPABILITY';
      rawDiagnosticsEnabled?: boolean;
      sessionId?: string;
    }
  | {
      type: 'EXPORT_START_HAR';
      capabilityToken?: string;
      sessionId?: string;
    }
  | {
      type: 'EXPORT_STOP_HAR';
      capabilityToken?: string;
      sessionId?: string;
    }
  | {
      type: 'EXPORT_CAPTURE_FULL_PAGE';
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'OPEN_EDITOR_WITH_IMAGE';
      dataUrl: string;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'SAVE_SCREENSHOT_TO_GALLERY';
      dataUrl: string;
      filename: string;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | ({
      type: 'SAVE_WEB_SNAPSHOT_TO_GALLERY';
    } & import('@sniptale/runtime-contracts/web-snapshot').WebSnapshotSaveToGalleryPayload)
  | {
      type: 'REGISTER_WEB_SNAPSHOT_ASSETS';
      assetUrls: string[];
      requestId: string;
    }
  | {
      type: 'FETCH_WEB_SNAPSHOT_ASSET';
      snapshotSessionId: string;
      url: string;
    }
  | ({
      type: 'STAGE_WEB_SNAPSHOT_BLOB_CHUNK';
    } & import('@sniptale/runtime-contracts/web-snapshot').WebSnapshotStageBlobChunkPayload)
  | {
      type: 'REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY';
      assetId: string;
      editorSessionId: string;
    }
  | {
      type: 'UPDATE_GALLERY_IMAGE_ASSET';
      assetId: string;
      dataUrl: string;
      editorSessionId: string;
      updateCapabilityToken: string;
      filename?: string;
    }
  | {
      type: 'STAGE_RECORDING_DOWNLOAD_CHUNK';
      base64: string;
      chunkIndex: number;
      recordingSessionId: string;
      stagedRecordingId: string;
      totalBytes: number;
      totalChunks: number;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'SAVE_RECORDING_FOR_DOWNLOAD';
      filename: string;
      mimeType: string;
      recordingSessionId: string;
      stagedRecordingId: string;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'RELEASE_RECORDING_DOWNLOAD';
      recordingSessionId: string;
      stagedRecordingId: string;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'TRIGGER_QUICK_ACTION';
      actionId: string;
      contentIntent?: ContentPrivilegedActionCapability;
      tabId?: number;
    };
