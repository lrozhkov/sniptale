import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const pageAccessRouteDescriptor = {
  handlerId: 'page-access',
  messageTypes: [MessageType.PAGE_ACCESS],
  ownerModule: 'apps/extension/src/background/runtime/page-access/route.ts',
  policyAuthorityFamily: 'page-access-owner',
  policyStateIds: ['page-access-tab-activation'],
  routeAuthorityFamily: 'page-access-owner',
} as const;
