import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export interface FrameAnnotationRasterReferencePayload {
  inputSha256: string;
  jobId: string;
  revision: number;
}

export type RuntimeFrameAnnotationRasterRequestByType = {
  [MessageType.FRAME_ANNOTATION_RASTERIZE]:
    | {
        type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
        operation: 'prepare';
        leaseId: string;
      }
    | {
        type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
        operation: 'confirm';
        leaseId: string;
      }
    | {
        type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
        operation: 'cancel';
        leaseId: string;
      }
    | {
        type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
        operation: 'rasterize';
        reference: FrameAnnotationRasterReferencePayload;
      };
  [MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE]: {
    type: typeof MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE;
    capabilityToken: string;
    reference: FrameAnnotationRasterReferencePayload;
  };
};

export type RuntimeFrameAnnotationRasterResponseByType = {
  [MessageType.FRAME_ANNOTATION_RASTERIZE]: RuntimeMessageResponse<{ result: string }>;
  [MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE]: RuntimeMessageResponse<{ result: string }>;
};
