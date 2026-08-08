import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const annotationForkSessionRouteDescriptor = {
  handlerId: 'annotation-fork-session',
  messageTypes: [MessageType.ANNOTATION_FORK_SESSION],
  ownerModule: 'apps/extension/src/background/annotation-fork-session/route.ts',
  policyAuthorityFamily: 'annotation-fork-session',
  policyStateIds: ['annotation-fork-sessions'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
