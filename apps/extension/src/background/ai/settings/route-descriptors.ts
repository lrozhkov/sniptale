import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const aiSettingsQueryRouteDescriptor = {
  handlerId: 'ai-settings-query',
  messageTypes: [MessageType.AI_SETTINGS_QUERY],
  ownerModule: 'apps/extension/src/background/ai/settings/query-route.ts',
  policyAuthorityFamily: 'ai-settings-query-authority',
  policyStateIds: [],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;

export const aiSettingsMutationRouteDescriptor = {
  handlerId: 'ai-settings-mutation',
  messageTypes: [MessageType.AI_SETTINGS_MUTATION],
  ownerModule: 'apps/extension/src/background/ai/settings/route.ts',
  policyAuthorityFamily: 'ai-settings-authority',
  policyStateIds: [],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;

export const aiSecretUnlockRouteDescriptor = {
  handlerId: 'ai-secret-unlock',
  messageTypes: [MessageType.AI_SECRET_UNLOCK],
  ownerModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.ts',
  policyAuthorityFamily: 'ai-secret-unlock-authority',
  policyStateIds: ['ai-secret-unlock-requests'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
