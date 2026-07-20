import type {
  RuntimeAckResponse,
  RuntimeMessageResponse,
} from '@sniptale/runtime-contracts/messaging/contracts/response';
import type {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
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
  Size2d,
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
  RuntimePageStyleRequestByType,
  RuntimePageStyleResponseByType,
} from '@sniptale/runtime-contracts/messaging/contracts/runtime-message/page-style';
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

type RuntimeEmptyResponse = RuntimeMessageResponse<Record<string, never>>;

type RuntimeCoreBaseRequestByType = RuntimeActionSaveRequestByType &
  RuntimeAiRequestByType &
  RuntimeHarRequestByType &
  RuntimePrivacyErasureRequestByType & {
    [MessageType.ENABLE_SCREENSHOT_MODE]: {
      type: typeof MessageType.ENABLE_SCREENSHOT_MODE;
      tabId?: number;
      viewport?: Size2d | null;
      quickActionOverlay?: QuickActionOverlay & { delaySeconds?: number };
      autoStartSelection?: boolean;
      autoStartCaptureType?: 'visible' | 'full';
    } & ContentPrivilegedActionGrantPayload;
    [MessageType.DISABLE_SCREENSHOT_MODE]: {
      type: typeof MessageType.DISABLE_SCREENSHOT_MODE;
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
    [MessageType.SET_VIEWPORT]: {
      type: typeof MessageType.SET_VIEWPORT;
      width?: number;
      height?: number;
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
  };

type RuntimeCoreBaseResponseByType = RuntimeActionSaveResponseByType &
  RuntimeAiResponseByType &
  RuntimeHarResponseByType &
  RuntimePrivacyErasureResponseByType & {
    [MessageType.ENABLE_SCREENSHOT_MODE]: RuntimeEmptyResponse;
    [MessageType.DISABLE_SCREENSHOT_MODE]: RuntimeEmptyResponse;
    [MessageType.SCREENSHOT_MODE_STATUS]: ScreenshotModeStatusResponse;
    [MessageType.ENABLE_HIGHLIGHTER_MODE]: RuntimeEmptyResponse;
    [MessageType.DISABLE_HIGHLIGHTER_MODE]: RuntimeEmptyResponse;
    [MessageType.HIGHLIGHTER_MODE_STATUS]: ModeStatusResponse;
    [MessageType.ENABLE_QUICK_EDIT_MODE]: RuntimeEmptyResponse;
    [MessageType.DISABLE_QUICK_EDIT_MODE]: RuntimeEmptyResponse;
    [MessageType.QUICK_EDIT_MODE_STATUS]: ModeStatusResponse;
    [MessageType.SET_VIEWPORT]: RuntimeEmptyResponse;
    [MessageType.GET_VIEWPORT_STATUS]: ViewportStatusResponse;
    [MessageType.PAGE_ACCESS]: PageAccessResponse;
    [MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY]: PopupTabRouteCapabilityResponse;
    [MessageType.CONTENT_RUNTIME_WAKEUP]: RuntimeMessageResponse<{
      restored?: boolean;
      reason?: 'pin-to-tab' | 'scenario';
    }>;
    [MessageType.EXPORT_POPUP_PROGRESS]: RuntimeAckResponse;
    [MessageType.EXPORT_POPUP_RESULT]: RuntimeAckResponse;
    [CaptureMessageType.CAPTURE_VISIBLE]: CaptureResponse;
    [CaptureMessageType.CAPTURE_FULL]: CaptureResponse;
    [CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP]: CaptureResponse;
  };

export type RuntimeCoreRequestByType = RuntimeCoreBaseRequestByType &
  RuntimeContentActionRequestByType &
  RuntimePopupExportRequestByType &
  RuntimeScenarioRequestByType &
  RuntimePageStyleRequestByType;

export type RuntimeCoreResponseByType = RuntimeCoreBaseResponseByType &
  RuntimeContentActionResponseByType &
  RuntimePopupExportResponseByType &
  RuntimeScenarioResponseByType &
  RuntimePageStyleResponseByType;
