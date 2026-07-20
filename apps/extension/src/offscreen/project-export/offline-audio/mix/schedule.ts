import { clampClipPlaybackRate } from '../../../../features/video/project/timeline';
import type { OfflineAudioRenderableClip } from '../clip-audio/index';

function resolveEnvelopeGainAtTime(
  clip: Pick<
    OfflineAudioRenderableClip,
    | 'audioGainEnd'
    | 'audioGainStart'
    | 'duration'
    | 'startTime'
    | 'volume'
    | 'volumeEnvelopeEnd'
    | 'volumeEnvelopeStart'
  >,
  time: number
) {
  const progress =
    clip.duration <= 0 ? 0 : Math.min(1, Math.max(0, (time - clip.startTime) / clip.duration));
  const startGain =
    Math.max(0, clip.volume) * (clip.volumeEnvelopeStart ?? clip.audioGainStart ?? 1);
  const endGain = Math.max(0, clip.volume) * (clip.volumeEnvelopeEnd ?? clip.audioGainEnd ?? 1);

  return startGain + (endGain - startGain) * progress;
}

export function scheduleOfflineAudioClipMix(
  offlineContext: OfflineAudioContext,
  clip: OfflineAudioRenderableClip,
  buffer: AudioBuffer
) {
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = clampClipPlaybackRate(clip.playbackRate ?? 1);
  const gain = offlineContext.createGain();
  gain.gain.setValueAtTime(0, 0);
  source.connect(gain);
  gain.connect(offlineContext.destination);

  const clipStart = Math.max(0, clip.startTime);
  const clipEnd = Math.max(clipStart, clip.startTime + clip.duration);
  const fadeInSeconds = Math.max(0, clip.fadeInMs / 1000);
  const fadeOutSeconds = Math.max(0, clip.fadeOutMs / 1000);
  const fadeInEnd = Math.min(clipEnd, clipStart + fadeInSeconds);
  const fadeOutStart = Math.max(clipStart, clipEnd - fadeOutSeconds);
  const envelopeGainStart = clip.muted ? 0 : resolveEnvelopeGainAtTime(clip, clipStart);
  const envelopeGainFadeInEnd = clip.muted ? 0 : resolveEnvelopeGainAtTime(clip, fadeInEnd);
  const envelopeGainFadeOutStart = clip.muted ? 0 : resolveEnvelopeGainAtTime(clip, fadeOutStart);
  const envelopeGainEnd = clip.muted ? 0 : resolveEnvelopeGainAtTime(clip, clipEnd);

  gain.gain.setValueAtTime(0, clipStart);
  if (envelopeGainStart > 0 || envelopeGainFadeInEnd > 0 || envelopeGainEnd > 0) {
    if (fadeInSeconds > 0 && fadeInEnd > clipStart) {
      gain.gain.linearRampToValueAtTime(envelopeGainFadeInEnd, fadeInEnd);
    } else {
      gain.gain.setValueAtTime(envelopeGainStart, clipStart);
    }

    gain.gain.setValueAtTime(envelopeGainFadeInEnd, fadeInEnd);
    if (fadeOutSeconds > 0 && fadeOutStart < clipEnd) {
      gain.gain.linearRampToValueAtTime(envelopeGainFadeOutStart, fadeOutStart);
      gain.gain.linearRampToValueAtTime(0, clipEnd);
    } else {
      gain.gain.linearRampToValueAtTime(envelopeGainEnd, clipEnd);
    }
  }
  gain.gain.setValueAtTime(0, clipEnd);

  source.start(clipStart, clip.sourceStart, clip.sourceDuration);
  source.stop(clipEnd);
}
