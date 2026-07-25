import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const highlighterSettingsMutationRouteDescriptor = {
  handlerId: 'highlighter-settings-mutation',
  messageTypes: [MessageType.HIGHLIGHTER_SETTINGS_MUTATION],
  ownerModule: 'apps/extension/src/background/highlighter-settings/route.ts',
  policyAuthorityFamily: 'highlighter-settings-mutation-authority',
  policyStateIds: [],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
