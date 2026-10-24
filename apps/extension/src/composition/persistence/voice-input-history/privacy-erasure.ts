import { createVoiceHistoryAudioStorage, type VoiceHistoryAudioStorage } from './opfs';

/** Runs under the caller's exclusive erasure barrier and never opens IndexedDB. */
export function createVoiceHistoryPrivacyErasure(
  audio: VoiceHistoryAudioStorage = createVoiceHistoryAudioStorage()
) {
  return {
    erase: () => audio.erase(),
    async verifyEmpty() {
      return (await audio.list()).length === 0;
    },
  };
}
