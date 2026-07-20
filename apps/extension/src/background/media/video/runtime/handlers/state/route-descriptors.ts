import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

export const videoRuntimeStateRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'video-runtime-owner-policy',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [
    VideoMessageType.GET_RECORDING_STATE,
    VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
    VideoMessageType.GET_RECORDING_TAB_ID,
  ],
  ownerModule: 'apps/extension/src/background/media/video/runtime/handlers/state/index.ts',
} as const;

export const offscreenLifecycleRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'offscreen-runtime-capability',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [
    VideoMessageType.RECORDING_DURATION_UPDATED,
    VideoMessageType.OFFSCREEN_RECORDING_STARTED,
    VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
    VideoMessageType.OFFSCREEN_ERROR,
    VideoMessageType.OFFSCREEN_READY,
    VideoMessageType.DESKTOP_MEDIA_OBTAINED,
    VideoMessageType.DESKTOP_MEDIA_CANCELLED,
    VideoMessageType.DESKTOP_MEDIA_FAILED,
  ],
  ownerModule:
    'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.ts',
} as const;

export const captureSourceObtainedRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'video-runtime-owner-policy',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [VideoMessageType.CAPTURE_SOURCE_OBTAINED],
  ownerModule:
    'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.ts',
} as const;

export const projectExportLifecycleRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'offscreen-runtime-capability',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [
    VideoMessageType.PROJECT_EXPORT_PROGRESS,
    VideoMessageType.PROJECT_EXPORT_COMPLETED,
    VideoMessageType.PROJECT_EXPORT_FAILED,
    VideoMessageType.PROJECT_EXPORT_CANCELLED,
  ],
  ownerModule:
    'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.ts',
} as const;
