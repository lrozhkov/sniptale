import { assertEffectDecodedAudio } from '../../runtime/resource-limits';
import { inspectMpegAudioProfile } from './mpeg';
import { inspectOggAudioProfile } from './ogg';
import type { EffectAudioContainerProfile } from './types';
import { inspectWavAudioProfile } from './wav';

export function inspectEffectAudioContainer(
  bytes: Uint8Array,
  mimeType: string
): EffectAudioContainerProfile {
  const profile =
    mimeType === 'audio/wav'
      ? inspectWavAudioProfile(bytes)
      : mimeType === 'audio/mpeg'
        ? inspectMpegAudioProfile(bytes)
        : mimeType === 'audio/ogg'
          ? inspectOggAudioProfile(bytes)
          : fail();
  assertEffectDecodedAudio(profile);
  return profile;
}

function fail(): never {
  throw new Error('AUDIO_PROFILE_INVALID');
}
