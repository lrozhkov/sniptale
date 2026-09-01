import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { CaptureActionType } from '../../../contracts/settings';
import type {
  ContentPrivilegedActionCapability,
  RecentCaptureEditorAssetCapability,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import type { WebSnapshotViewerPorts } from '../page-preparation/viewer-ports';
import type { PreauthorizedContentActionBinding } from '../../routing-contracts/capabilities/content-action/route';

export type ViewportState = import('../../routing-contracts/tab-mode-state').ViewportState;

export type CaptureGuardState = { isCapturing: boolean };

export type SendResponse = ResponseSender;

export type CaptureRouteContext = {
  contentPreauthorization?: PreauthorizedContentActionBinding | undefined;
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
      type: 'EXPORT_CAPTURE_FULL_PAGE';
      contentIntent?: ContentPrivilegedActionCapability;
      exportRunId: string;
    }
  | {
      type: 'OPEN_EDITOR_WITH_IMAGE';
      assetId?: string;
      dataUrl: string;
      contentIntent?: ContentPrivilegedActionCapability;
      editorAssetCapability?: RecentCaptureEditorAssetCapability;
    }
  | {
      type: 'SAVE_SCREENSHOT_TO_GALLERY';
      dataUrl: string;
      filename: string;
      storageClass?: 'temporary' | 'library';
      contentIntent?: ContentPrivilegedActionCapability;
    }
  | {
      type: 'REGISTER_WEB_SNAPSHOT_ASSETS';
      assetUrls: string[];
      requestId: string;
    }
  | {
      type: 'FETCH_WEB_SNAPSHOT_ASSET';
      snapshotSessionId: string;
      urls: string[];
    }
  | {
      base64: string;
      final: boolean;
      jobId: string;
      ordinal: number;
      sequence: number;
      stagedBlobId: string;
      type: 'STAGE_PAGE_PACKAGE_JOB_CHUNK';
    }
  | {
      activeStepKey: import('@sniptale/runtime-contracts/export').ExportProgressStepKey;
      current: number;
      requestId: string;
      total: number;
      type: 'WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED';
    }
  | {
      type: 'TRIGGER_QUICK_ACTION';
      actionId: string;
      contentIntent?: ContentPrivilegedActionCapability;
      desktopSelection?: import('@sniptale/runtime-contracts/capture/action').DesktopScreenshotSelection;
      tabId?: number;
    }
  | {
      type: 'PREPARE_DESKTOP_SCREENSHOT_CAPTURE';
      actionId?: string;
      config?: import('@sniptale/runtime-contracts/capture/action').ScreenshotCaptureConfig;
      tabId?: number;
    }
  | {
      type: 'TRIGGER_SCREENSHOT_CAPTURE';
      config: import('@sniptale/runtime-contracts/capture/action').ScreenshotCaptureConfig;
      desktopSelection?: import('@sniptale/runtime-contracts/capture/action').DesktopScreenshotSelection;
      tabId?: number;
    };
