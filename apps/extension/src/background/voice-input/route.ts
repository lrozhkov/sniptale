import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseOffscreenVoiceInputRuntimeMessage,
  VoiceInputPortMessageType,
} from '@sniptale/runtime-contracts/voice-input';
import { handleVoiceInputOffscreenEvent, type createVoiceInputCoordinator } from './coordinator';

export function routeVoiceInputOffscreenEvent(
  message: unknown,
  sendResponse: ResponseSender,
  coordinator?: ReturnType<typeof createVoiceInputCoordinator>
): boolean {
  const parsed = parseOffscreenVoiceInputRuntimeMessage(message);
  if (
    !parsed ||
    parsed.type !== MessageType.OFFSCREEN_VOICE_INPUT_EVENT ||
    parsed.event.type === VoiceInputPortMessageType.AUDIO_LEVEL
  ) {
    return false;
  }
  handleVoiceInputOffscreenEvent(parsed, coordinator);
  sendResponse({ success: true, result: 'accepted' });
  return true;
}
