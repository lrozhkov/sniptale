import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const nativeAppRouteDescriptor = {
  handlerId: 'native-app-runtime',
  messageTypes: [MessageType.NATIVE_APP_QUERY, MessageType.NATIVE_APP_MUTATION],
  ownerModule: 'apps/extension/src/background/runtime/native-app/route.ts',
  policyAuthorityFamily: 'native-app-runtime-authority',
  policyStateIds: [],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
