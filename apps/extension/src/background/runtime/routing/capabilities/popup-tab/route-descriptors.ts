import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const popupTabRouteCapabilityIssuanceDescriptor = {
  handlerId: 'popup-tab-route-capability-issuance',
  messageTypes: [MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY],
  ownerModule:
    'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
  policyAuthorityFamily: 'popup-tab-route-capability-issuance',
  policyStateIds: ['popup-tab-route-capabilities'],
  routeAuthorityFamily: 'popup-tab-route-capability-issuance',
} as const;
