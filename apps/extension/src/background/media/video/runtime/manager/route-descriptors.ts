import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

export const videoControlRouteDescriptor = {
  actionKind: 'tab',
  alternateAuthorityFamilies: [
    'video-control-camera-recorder-route',
    'video-control-no-tab-route',
    'video-control-owner-no-tab-route',
  ],
  authorityFamily: 'video-control-privileged-tab-route',
  handlerAdapter: 'routeTabAction',
  keepChannelBehaviorSource: 'tab-routing-adapter',
  messageTypes: [
    VideoMessageType.START_RECORDING,
    VideoMessageType.CANCEL_RECORDING_START,
    VideoMessageType.STOP_RECORDING,
    VideoMessageType.PAUSE_RECORDING,
    VideoMessageType.RESUME_RECORDING,
    VideoMessageType.UPDATE_SETTINGS,
  ],
  ownerModule: 'apps/extension/src/background/media/video/runtime/manager/control-route.ts',
} as const;
