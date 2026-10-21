import {
  createReviewAudioClipRenderer,
  REVIEW_AUDIO_CLIP_PADDING_SECONDS,
} from '../../../../workflows/video-review/audio-clip-render';
import { buildAudioFadeEnvelope } from '../../../../features/video/audio/fades';
import { renderTempoBuffer } from '../../../../features/video/audio/tempo-buffer';
import { getTransitionProgress } from '../../../../features/video/project/transition/runtime';
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

export async function scheduleOfflineAudioClipMix(
  offlineContext: OfflineAudioContext,
  clip: OfflineAudioRenderableClip,
  buffer: AudioBuffer,
  signal?: AbortSignal
) {
  const rate = clampClipPlaybackRate(clip.playbackRate ?? 1);
  const voice = 'sourceKind' in clip && clip.sourceKind === 'source-voiceover' ? clip : null;
  const localFrom = voice ? (clip.sourceStart - voice.playbackEntry.sourceOffset) / rate : 0;
  const prepared =
    rate === 1
      ? buffer
      : voice
        ? await createReviewAudioClipRenderer().render(
            voice.playbackEntry,
            buffer,
            localFrom,
            localFrom + clip.duration,
            signal ?? new AbortController().signal
          )
        : await renderTempoBuffer(
            buffer,
            {
              start: clip.sourceStart,
              duration: clip.sourceDuration,
              rate,
            },
            signal
          );
  signal?.throwIfAborted();
  const source = offlineContext.createBufferSource();
  source.buffer = prepared;
  source.playbackRate.value = 1;
  const gain = offlineContext.createGain();
  gain.gain.setValueAtTime(0, 0);
  source.connect(gain);
  const faded = connectAudioFade(offlineContext, gain, clip);
  const output = connectOriginalAudioAttenuation(offlineContext, faded, clip);
  if (clip.audioTransitions?.length) {
    const transitionGain = offlineContext.createGain();
    output.connect(transitionGain);
    transitionGain.connect(offlineContext.destination);
    transitionGain.gain.setValueAtTime(1, 0);
    for (const transition of clip.audioTransitions) {
      const start = Math.max(0, clip.startTime, transition.start);
      const end = Math.min(clip.startTime + clip.duration, transition.end);
      if (end <= start) continue;
      const steps = 128;
      for (let index = 0; index <= steps; index++) {
        const time = start + ((end - start) * index) / steps;
        const progress =
          time >= transition.end
            ? 1
            : (getTransitionProgress(
                {
                  start: transition.start,
                  end: transition.end,
                  transition: { easing: transition.easing },
                },
                time
              ) ?? 0);
        const value = transition.incoming ? progress : 1 - progress;
        if (index === 0) transitionGain.gain.setValueAtTime(value, time);
        else transitionGain.gain.linearRampToValueAtTime(value, time);
      }
    }
  } else {
    output.connect(offlineContext.destination);
  }

  const clipStart = Math.max(0, clip.startTime);
  const clipEnd = Math.max(clipStart, clip.startTime + clip.duration);
  const envelopeGainStart = clip.muted ? 0 : resolveEnvelopeGainAtTime(clip, clipStart);
  const envelopeGainEnd = clip.muted ? 0 : resolveEnvelopeGainAtTime(clip, clipEnd);
  gain.gain.setValueAtTime(envelopeGainStart, clipStart);
  if (envelopeGainStart > 0 || envelopeGainEnd > 0)
    gain.gain.linearRampToValueAtTime(envelopeGainEnd, clipEnd);

  const offset =
    rate === 1
      ? clip.sourceStart
      : voice
        ? Math.round(buffer.sampleRate * REVIEW_AUDIO_CLIP_PADDING_SECONDS) / buffer.sampleRate
        : 0;
  source.start(clipStart, offset, clip.sourceDuration / rate);
  source.stop(clipEnd);
}

/** A separate stage preserves the manual envelope and its fade/transition automation. */
function connectOriginalAudioAttenuation(
  context: OfflineAudioContext,
  input: GainNode,
  clip: OfflineAudioRenderableClip
): GainNode {
  if (!clip.originalAudioRanges?.length) return input;
  const output = context.createGain();
  input.connect(output);
  output.gain.setValueAtTime(1, 0);
  for (const range of clip.originalAudioRanges) {
    const start = Math.max(0, clip.startTime, range.start);
    const end = Math.min(clip.startTime + clip.duration, range.end);
    if (end <= start) continue;
    output.gain.setValueAtTime(range.volume, start);
    output.gain.setValueAtTime(1, end);
  }
  return output;
}

/** Separate linear stages preserve the exact product of manual gain and fade. */
function connectAudioFade(
  context: OfflineAudioContext,
  input: GainNode,
  clip: OfflineAudioRenderableClip
): GainNode {
  if (clip.fadeInMs <= 0 && clip.fadeOutMs <= 0) return input;
  const output = context.createGain();
  input.connect(output);
  const start = Math.max(0, clip.startTime);
  const points = buildAudioFadeEnvelope({
    duration: clip.audioFadePhase?.duration ?? clip.duration,
    offset: clip.audioFadePhase?.offset ?? 0,
    fadeIn: clip.fadeInMs / 1000,
    fadeOut: clip.fadeOutMs / 1000,
    intervalDuration: clip.duration,
    elapsed: Math.max(0, start - clip.startTime),
  });
  points.forEach(([local, factor], index) => {
    const at = clip.startTime + local;
    if (index === 0) output.gain.setValueAtTime(factor, at);
    else output.gain.linearRampToValueAtTime(factor, at);
  });
  return output;
}
