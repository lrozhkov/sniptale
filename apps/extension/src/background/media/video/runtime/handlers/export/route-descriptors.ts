import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

export const projectExportCommandRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'project-export-capability',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-project-export-authority',
  messageTypes: [VideoMessageType.START_PROJECT_EXPORT, VideoMessageType.CANCEL_PROJECT_EXPORT],
  ownerModule:
    'apps/extension/src/background/media/video/runtime/handlers/export/project-export.ts',
} as const;

export const projectExportCapabilityIssuanceRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'project-export-capability-issuance',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES],
  ownerModule:
    'apps/extension/src/background/media/video/runtime/handlers/export/project-export.ts',
} as const;

export const recordingDownloadRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'offscreen-runtime-capability',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [
    VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
    VideoMessageType.DOWNLOAD_RECORDING,
    VideoMessageType.VIDEO_SAVED_TO_IDB,
  ],
  ownerModule: 'apps/extension/src/background/media/video/runtime/handlers/export/download.ts',
} as const;
