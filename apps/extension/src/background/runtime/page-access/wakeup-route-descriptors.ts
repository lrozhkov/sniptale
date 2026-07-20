import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const contentRuntimeWakeupRouteDescriptor = {
  handlerId: 'content-runtime-wakeup',
  messageTypes: [MessageType.CONTENT_RUNTIME_WAKEUP],
  ownerModule: 'apps/extension/src/background/runtime/page-access/wakeup-route.ts',
  policyAuthorityFamily: 'content-runtime-wakeup',
  policyStateIds: ['page-access-tab-activation'],
  routeAuthorityFamily: 'content-runtime-wakeup',
} as const;
