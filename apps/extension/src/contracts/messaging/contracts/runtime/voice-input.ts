import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  parseOffscreenVoiceInputRuntimeMessage,
  parseVoiceInputSnapshot,
  type OffscreenVoiceInputResponse,
  type VoiceInputRuntimeRequestByType,
} from '@sniptale/runtime-contracts/voice-input';
import { createRuntimeResponseGuard } from '../../validators/index';
import type { PartialRuntimeRegistry } from '../runtime-message.registry.ts';

function isVoiceInputRequest<TType extends keyof VoiceInputRuntimeRequestByType>(
  expectedType: TType
): (input: unknown) => input is VoiceInputRuntimeRequestByType[TType] {
  return (input): input is VoiceInputRuntimeRequestByType[TType] => {
    const parsed = parseOffscreenVoiceInputRuntimeMessage(input);
    return parsed?.type === expectedType;
  };
}

const voiceInputResponseGuard = createRuntimeResponseGuard<OffscreenVoiceInputResponse>({
  optional: {
    result: (value) => value === 'accepted' || value === 'stale',
    snapshot: (value) => parseVoiceInputSnapshot(value) !== null,
  },
});

function createVoiceInputContract<TType extends keyof VoiceInputRuntimeRequestByType>(type: TType) {
  return {
    parseRequest: createGuardParser(`runtime ${type} message`, isVoiceInputRequest(type)),
    parseResponse: createGuardParser(`runtime ${type} response`, voiceInputResponseGuard),
  };
}

export const runtimeVoiceInputMessageContracts = {
  [MessageType.OFFSCREEN_VOICE_INPUT_EVENT]: createVoiceInputContract(
    MessageType.OFFSCREEN_VOICE_INPUT_EVENT
  ),
  [MessageType.OFFSCREEN_VOICE_INPUT_START]: createVoiceInputContract(
    MessageType.OFFSCREEN_VOICE_INPUT_START
  ),
  [MessageType.OFFSCREEN_VOICE_INPUT_STATUS]: createVoiceInputContract(
    MessageType.OFFSCREEN_VOICE_INPUT_STATUS
  ),
  [MessageType.OFFSCREEN_VOICE_INPUT_STOP]: createVoiceInputContract(
    MessageType.OFFSCREEN_VOICE_INPUT_STOP
  ),
} satisfies PartialRuntimeRegistry;
