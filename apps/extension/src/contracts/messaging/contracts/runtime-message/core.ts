import type {
  RuntimeAckResponse,
  RuntimeMessageResponse,
} from '@sniptale/runtime-contracts/messaging/contracts/response';
import type {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ViewportPresetAvailabilityPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ViewportStatusResponse } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureActionType, QuickActionOverlay } from '../../../settings';
import type {
  PageAccessMessage,
  PageAccessResponse,
} from '@sniptale/runtime-contracts/messaging/page-access';
import type {
  RuntimePopupExportProgressMessage,
  RuntimePopupExportResultMessage,
  ContentPrivilegedActionGrantPayload,
  ScenarioRuntimeCapturePayload,
} from '../types';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type {
  CaptureResponse,
  ModeStatusResponse,
  ScreenshotModeStatusResponse,
} from '../response-types';
import type { PopupTabRouteCapabilityResponse } from '../response-types';
import type {
  RuntimeScenarioRequestByType,
  RuntimeScenarioResponseByType,
} from '../../scenario/runtime';
import type {
  RuntimePopupExportRequestByType,
  RuntimePopupExportResponseByType,
  PopupTabRouteOperation,
} from '@sniptale/runtime-contracts/messaging/contracts/runtime-message/popup-export';
import type {
  RuntimeActionSaveRequestByType,
  RuntimeActionSaveResponseByType,
} from '../runtime/actions/save.types.ts';
import type { RuntimeHarRequestByType, RuntimeHarResponseByType } from './har.types.ts';
import type { RuntimeAiRequestByType, RuntimeAiResponseByType } from './ai.types.ts';
import type {
  RuntimePrivacyErasureRequestByType,
  RuntimePrivacyErasureResponseByType,
} from './privacy-erasure.types.ts';
import type {
  RuntimeContentActionRequestByType,
  RuntimeContentActionResponseByType,
} from '@sniptale/runtime-contracts/messaging/contracts/runtime-message/content-action';
import type {
  RuntimeFrameAnnotationRasterRequestByType,
  RuntimeFrameAnnotationRasterResponseByType,
} from './frame-annotation-raster.types';

type RuntimeEmptyResponse = RuntimeMessageResponse<Record<string, never>>;

type RuntimeCoreBaseRequestByType = RuntimeActionSaveRequestByType &
  RuntimeAiRequestByType &
  RuntimeHarRequestByType &
  RuntimePrivacyErasureRequestByType &
  RuntimeFrameAnnotationRasterRequestByType & {
    [MessageType.ENABLE_SCREENSHOT_MODE]: {
      type: typeof MessageType.ENABLE_SCREENSHOT_MODE;
      contentIntent?: ContentPrivilegedActionCapability;
      tabId?: number;
      viewport?: AppliedViewportPresetPayload | null;
      quickActionOverlay?: QuickActionOverlay & { delaySeconds?: number };
      autoStartSelection?: boolean;
      autoStartCaptureType?: 'visible' | 'full';
      toolbarVisible?: boolean;
      surfaceCapabilityToken?: string;
      surfaceLeaseGeneration?: number;
      surfaceOperationGeneration?: number;
      surfaceWarning?: string;
    } & ContentPrivilegedActionGrantPayload;
    [MessageType.DISABLE_SCREENSHOT_MODE]: {
      type: typeof MessageType.DISABLE_SCREENSHOT_MODE;
      leaseGeneration?: number;
      operationGeneration?: number;
      surfaceCapabilityToken?: string;
      tabId?: number;
    };
    [MessageType.SCREENSHOT_MODE_STATUS]: {
      type: typeof MessageType.SCREENSHOT_MODE_STATUS;
      tabId?: number;
    };
    [MessageType.ENABLE_HIGHLIGHTER_MODE]: {
      type: typeof MessageType.ENABLE_HIGHLIGHTER_MODE;
      tabId?: number;
    };
    [MessageType.DISABLE_HIGHLIGHTER_MODE]: {
      type: typeof MessageType.DISABLE_HIGHLIGHTER_MODE;
      tabId?: number;
    };
    [MessageType.HIGHLIGHTER_MODE_STATUS]: {
      type: typeof MessageType.HIGHLIGHTER_MODE_STATUS;
      tabId?: number;
    };
    [MessageType.ENABLE_QUICK_EDIT_MODE]: {
      type: typeof MessageType.ENABLE_QUICK_EDIT_MODE;
      tabId?: number;
    };
    [MessageType.DISABLE_QUICK_EDIT_MODE]: {
      type: typeof MessageType.DISABLE_QUICK_EDIT_MODE;
      tabId?: number;
    };
    [MessageType.QUICK_EDIT_MODE_STATUS]: {
      type: typeof MessageType.QUICK_EDIT_MODE_STATUS;
      tabId?: number;
    };
    [MessageType.APPLY_VIEWPORT_PRESET]: {
      type: typeof MessageType.APPLY_VIEWPORT_PRESET;
      operationGeneration: number;
      presetId: string;
      surfaceCapabilityToken: string;
      tabId?: number;
    };
    [MessageType.RELEASE_VIEWPORT_PRESET]: {
      type: typeof MessageType.RELEASE_VIEWPORT_PRESET;
      leaseGeneration: number;
      operationGeneration: number;
      surfaceCapabilityToken: string;
      tabId?: number;
    };
    [MessageType.GET_VIEWPORT_PRESET_AVAILABILITY]: {
      type: typeof MessageType.GET_VIEWPORT_PRESET_AVAILABILITY;
      context?: 'screenshot' | 'video';
      presetIds: string[];
      tabId?: number;
    };
    [MessageType.GET_VIEWPORT_STATUS]: {
      type: typeof MessageType.GET_VIEWPORT_STATUS;
      tabId?: number;
    };
    [MessageType.PAGE_ACCESS]: PageAccessMessage;
    [MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY]: {
      type: typeof MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY;
      tabId: number;
      operation: PopupTabRouteOperation;
      requestId: string;
    };
    [MessageType.CONTENT_RUNTIME_WAKEUP]: {
      contentIntent?: ContentPrivilegedActionCapability;
      pinToTab?: boolean;
      toolbarVisible?: boolean;
      type: typeof MessageType.CONTENT_RUNTIME_WAKEUP;
    };
    [MessageType.EXPORT_POPUP_PROGRESS]: RuntimePopupExportProgressMessage;
    [MessageType.EXPORT_POPUP_RESULT]: RuntimePopupExportResultMessage;
    [CaptureMessageType.CAPTURE_VISIBLE]: {
      type: typeof CaptureMessageType.CAPTURE_VISIBLE;
      actionType?: CaptureActionType;
      contentIntent?: ContentPrivilegedActionCapability;
      scenarioCapture?: ScenarioRuntimeCapturePayload;
    };
    [CaptureMessageType.CAPTURE_FULL]: {
      type: typeof CaptureMessageType.CAPTURE_FULL;
      actionType?: CaptureActionType;
      contentIntent?: ContentPrivilegedActionCapability;
      scenarioCapture?: ScenarioRuntimeCapturePayload;
    };
    [CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP]: {
      type: typeof CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP;
      contentIntent?: ContentPrivilegedActionCapability;
    };
    [CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION]: {
      type: typeof CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION;
      contentIntent: ContentPrivilegedActionCapability;
    };
  };

type RuntimeCoreBaseResponseByType = RuntimeActionSaveResponseByType &
  RuntimeAiResponseByType &
  RuntimeHarResponseByType &
  RuntimePrivacyErasureResponseByType &
  RuntimeFrameAnnotationRasterResponseByType & {
    [MessageType.ENABLE_SCREENSHOT_MODE]: RuntimeEmptyResponse;
    [MessageType.DISABLE_SCREENSHOT_MODE]: RuntimeEmptyResponse;
    [MessageType.SCREENSHOT_MODE_STATUS]: ScreenshotModeStatusResponse;
    [MessageType.ENABLE_HIGHLIGHTER_MODE]: RuntimeEmptyResponse;
    [MessageType.DISABLE_HIGHLIGHTER_MODE]: RuntimeEmptyResponse;
    [MessageType.HIGHLIGHTER_MODE_STATUS]: ModeStatusResponse;
    [MessageType.ENABLE_QUICK_EDIT_MODE]: RuntimeEmptyResponse;
    [MessageType.DISABLE_QUICK_EDIT_MODE]: RuntimeEmptyResponse;
    [MessageType.QUICK_EDIT_MODE_STATUS]: ModeStatusResponse;
    [MessageType.APPLY_VIEWPORT_PRESET]: RuntimeEmptyResponse;
    [MessageType.RELEASE_VIEWPORT_PRESET]: RuntimeEmptyResponse;
    [MessageType.GET_VIEWPORT_PRESET_AVAILABILITY]: RuntimeMessageResponse<{
      availabilities?: ViewportPresetAvailabilityPayload[];
    }>;
    [MessageType.GET_VIEWPORT_STATUS]: ViewportStatusResponse;
    [MessageType.PAGE_ACCESS]: PageAccessResponse;
    [MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY]: PopupTabRouteCapabilityResponse;
    [MessageType.CONTENT_RUNTIME_WAKEUP]: RuntimeMessageResponse<{
      pinToTab: boolean;
      pinToTabAvailable: boolean;
      restored?: boolean;
      reason?: 'pin-to-tab' | 'scenario';
    }>;
    [MessageType.EXPORT_POPUP_PROGRESS]: RuntimeAckResponse;
    [MessageType.EXPORT_POPUP_RESULT]: RuntimeAckResponse;
    [CaptureMessageType.CAPTURE_VISIBLE]: CaptureResponse;
    [CaptureMessageType.CAPTURE_FULL]: CaptureResponse;
    [CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP]: CaptureResponse;
    [CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION]: RuntimeMessageResponse<{
      surfaceCapabilityToken: string;
      surfaceLeaseGeneration?: number;
      surfaceOperationGeneration: number;
    }>;
  };

export type RuntimeCoreRequestByType = RuntimeCoreBaseRequestByType &
  RuntimeContentActionRequestByType &
  RuntimePopupExportRequestByType &
  RuntimeScenarioRequestByType;

export type RuntimeCoreResponseByType = RuntimeCoreBaseResponseByType &
  RuntimeContentActionResponseByType &
  RuntimePopupExportResponseByType &
  RuntimeScenarioResponseByType;
