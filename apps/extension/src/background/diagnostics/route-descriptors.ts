import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

export const diagnosticContentRuntimeRouteDescriptor = {
  actionKind: 'video-runtime',
  authorityFamily: 'diagnostic-content-runtime',
  handlerAdapter: 'routeVideoRuntimeAction',
  keepChannelBehaviorSource: 'video-runtime-router-result',
  messageTypes: [VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS],
  ownerModule: 'apps/extension/src/background/diagnostics/handlers.ts',
} as const;
