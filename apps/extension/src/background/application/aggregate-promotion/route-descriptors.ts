import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const aggregatePromotionRouteDescriptor = {
  handlerId: 'aggregate-promotion',
  messageTypes: [MessageType.PROMOTE_AGGREGATE_TO_LIBRARY],
  ownerModule: 'apps/extension/src/background/application/aggregate-promotion/route.ts',
  policyAuthorityFamily: 'aggregate-promotion-authority',
  policyStateIds: ['aggregate-editor-presence'] as const,
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
