import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const contentActionRouteDescriptor = {
  handlerId: 'content-action-capability-issuance',
  messageTypes: [
    MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
    MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  ],
  ownerModule:
    'apps/extension/src/background/routing-contracts/capabilities/content-action/route.ts',
  policyAuthorityFamily: 'content-action-capability-issuance',
  policyStateIds: [
    'content-action-activation-keys',
    'content-action-capabilities',
    'content-action-runtime-tokens',
    'content-action-trusted-event-proofs',
  ],
  routeAuthorityFamily: 'content-action-capability-issuance',
} as const;
