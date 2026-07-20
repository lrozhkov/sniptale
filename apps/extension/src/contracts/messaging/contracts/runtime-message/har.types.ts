import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type {
  CaptureResponse,
  HarCaptureResponse,
  HarStartResponse,
  PopupTabRouteCapabilityResponse,
} from '../response-types';

export type RuntimeHarRequestByType = {
  [MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY]: {
    type: typeof MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY;
    rawDiagnosticsEnabled?: boolean;
    sessionId: string;
  };
  [MessageType.EXPORT_START_HAR]: {
    type: typeof MessageType.EXPORT_START_HAR;
    sessionId: string;
    capabilityToken: string;
  };
  [MessageType.EXPORT_STOP_HAR]: {
    type: typeof MessageType.EXPORT_STOP_HAR;
    sessionId: string;
    capabilityToken: string;
  };
  [MessageType.EXPORT_CAPTURE_FULL_PAGE]: {
    type: typeof MessageType.EXPORT_CAPTURE_FULL_PAGE;
    contentIntent?: ContentPrivilegedActionCapability;
  };
};

export type RuntimeHarResponseByType = {
  [MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY]: PopupTabRouteCapabilityResponse;
  [MessageType.EXPORT_START_HAR]: HarStartResponse;
  [MessageType.EXPORT_STOP_HAR]: HarCaptureResponse;
  [MessageType.EXPORT_CAPTURE_FULL_PAGE]: CaptureResponse;
};
