import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const settingsTransferRouteDescriptor = {
  handlerId: 'settings-transfer',
  messageTypes: [MessageType.SETTINGS_TRANSFER],
  ownerModule: 'apps/extension/src/background/application/settings-transfer/route.ts',
  policyAuthorityFamily: 'settings-transfer-authority',
  policyStateIds: ['persistent-data-erasure-lease'] as const,
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
