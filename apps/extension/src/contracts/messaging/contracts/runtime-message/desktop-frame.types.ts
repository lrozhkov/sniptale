import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export type DesktopFrameImageFormat = 'png' | 'jpeg' | 'webp';

export type RuntimeDesktopFrameRequestByType = {
  [MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME]: {
    type: typeof MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME;
    capabilityToken: string;
    requestId: string;
    streamId: string;
    imageFormat: DesktopFrameImageFormat;
    imageQuality: number;
  };
  [MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD]: {
    type: typeof MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD;
    capabilityToken: string;
    requestId: string;
    dataUrl: string;
  };
};

export type RuntimeDesktopFrameResponseByType = {
  [MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME]: RuntimeMessageResponse<{
    result: 'captured';
    dataUrl: string;
    width: number;
    height: number;
  }>;
  [MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD]: RuntimeMessageResponse<{
    result: 'copied';
  }>;
};
