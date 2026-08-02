import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  OffscreenVoiceInputCommand,
  OffscreenVoiceInputResponse,
} from '@sniptale/runtime-contracts/voice-input';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { acquireMediaMutationPermit } from '../mutation-exclusion/media-activity';
import { getBackgroundRuntimeMessaging } from '../routing-contracts/runtime-messaging/services';
import { ensureOffscreenDocument, waitForOffscreenReady } from '../offscreen-document/service';

type UnsignedOffscreenVoiceInputCommand =
  | Omit<
      Extract<
        OffscreenVoiceInputCommand,
        { type: typeof MessageType.OFFSCREEN_VOICE_INPUT_STATUS }
      >,
      'capabilityToken'
    >
  | Omit<
      Extract<OffscreenVoiceInputCommand, { type: typeof MessageType.OFFSCREEN_VOICE_INPUT_START }>,
      'capabilityToken'
    >
  | Omit<
      Extract<OffscreenVoiceInputCommand, { type: typeof MessageType.OFFSCREEN_VOICE_INPUT_STOP }>,
      'capabilityToken'
    >;

export type VoiceInputOffscreenGateway = {
  ensureReady(): Promise<void>;
  send(message: UnsignedOffscreenVoiceInputCommand): Promise<OffscreenVoiceInputResponse>;
  withMediaMutationPermit<T>(work: () => Promise<T>): Promise<T>;
};

export function createVoiceInputOffscreenGateway(): VoiceInputOffscreenGateway {
  return {
    async ensureReady() {
      await ensureOffscreenDocument('Recognize extension voice input');
      await waitForOffscreenReady(5_000);
    },
    send(message) {
      const authorizedMessage: OffscreenVoiceInputCommand =
        attachOffscreenCommandCapability(message);
      return getBackgroundRuntimeMessaging().sendRuntimeMessage(authorizedMessage);
    },
    async withMediaMutationPermit(work) {
      const release = acquireMediaMutationPermit();
      if (!release) throw new Error('privacy-erasure-in-progress');
      try {
        return await work();
      } finally {
        release();
      }
    },
  };
}
