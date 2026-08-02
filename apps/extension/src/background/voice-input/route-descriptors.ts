import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const voiceInputOffscreenEventRouteDescriptor = {
  handlerId: 'voice-input-offscreen-event',
  messageTypes: [MessageType.OFFSCREEN_VOICE_INPUT_EVENT],
  ownerModule: 'apps/extension/src/background/voice-input/route.ts',
  policyAuthorityFamily: 'voice-input-offscreen-event-authority',
  policyStateIds: ['voice-input-port-session-authority'],
  routeAuthorityFamily: 'background-owned-ipc',
} as const;
