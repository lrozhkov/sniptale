import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

export const videoRecordingSurfaceRouteDescriptor = {
  actionKind: 'tab',
  authorityFamily: 'video-recording-surface-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
    VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
    VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE,
    VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
    VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE,
  ],
  ownerModule: 'apps/extension/src/background/media/video/content-surface/route.ts',
} as const;
