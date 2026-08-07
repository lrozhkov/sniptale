import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const frameAnnotationRasterRouteDescriptor = {
  handlerId: 'frame-annotation-raster',
  messageTypes: [MessageType.FRAME_ANNOTATION_RASTERIZE],
  ownerModule: 'apps/extension/src/background/frame-annotation-raster/route.ts',
  policyAuthorityFamily: 'frame-annotation-raster-authority',
  policyStateIds: ['frame-annotation-raster-jobs'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
