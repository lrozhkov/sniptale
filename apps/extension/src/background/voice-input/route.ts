import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseOffscreenVoiceInputRuntimeMessage } from '@sniptale/runtime-contracts/voice-input';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { handleVoiceInputOffscreenEvent } from './coordinator';

export function routeVoiceInputOffscreenEvent(
  message: unknown,
  sendResponse: ResponseSender
): boolean {
  const parsed = parseOffscreenVoiceInputRuntimeMessage(message);
  if (!parsed || parsed.type !== MessageType.OFFSCREEN_VOICE_INPUT_EVENT) return false;
  handleVoiceInputOffscreenEvent(parsed);
  sendResponse({ success: true, result: 'accepted' });
  return true;
}
