import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { CaptureActionType } from '../../../contracts/settings';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import type { WebSnapshotViewerPorts } from '../page-preparation/viewer-ports';

export type ViewportState = import('../../routing-contracts/tab-mode-state').ViewportState;

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
      type: 'DOWNLOAD_BROWSER_ANNOTATIONS';
      text: string;
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'OPEN_EXPORT_MODAL';
      contentIntent?: ContentPrivilegedActionCapability;
    }
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
      type: 'RENEW_SCREENSHOT_SURFACE_SESSION';
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
      exportRunId: string;
    }
  | {
      type: 'EXPORT_CAPTURE_FULL_PAGE_UNATTENDED';
      contentIntent?: ContentPrivilegedActionCapability;
      exportRunId: string;
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
      type: 'RELEASE_WEB_SNAPSHOT_STAGED_BLOBS';
      snapshotSessionId: string;
    }
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
      type: 'TRIGGER_QUICK_ACTION';
      actionId: string;
      contentIntent?: ContentPrivilegedActionCapability;
      tabId?: number;
    };
