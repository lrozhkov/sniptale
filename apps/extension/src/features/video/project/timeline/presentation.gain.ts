import { getClipPlaybackOffset, normalizeClipPlaybackRate } from './rate';
import { getProjectSourceAudioRanges } from '../source-audio';
import { getClipGainRange } from './audio';
import { getAudioFadeFactor } from '../../audio/fades';
import { getProjectTrackAudioVolume } from './track-audio';
import { getProjectOriginalAudioRanges } from './original-audio';
import {
  sourceAudioAttenuationAtTime,
  sourceAudioGainAtTime,
} from '../../audio/source-attenuation';
import { clampNumber } from './basics';
import type { VideoProject, VideoProjectClip } from '../types/index';
import {
  resolveClipTransitionAudioMultiplier,
  resolveClipTransitionVisualState,
} from '../transition/presentation';

function fadeClock(clip: VideoProjectClip, currentTime: number, visual: boolean) {
  const phase = clip.playbackWindow?.fadePhase;
  let elapsed = currentTime - clip.startTime;
  if (!phase) return { time: elapsed, duration: clip.duration };
  if (visual && clip.playbackWindow?.holdAt !== undefined)
    elapsed = Math.min(elapsed, clip.playbackWindow.holdAt - clip.playbackWindow.offset);
  return { time: phase.offset + elapsed, duration: phase.duration };
}

export function getClipFadeMultiplier(clip: VideoProjectClip, currentTime: number): number {
  const clock = fadeClock(clip, currentTime, true);
  const localTimeMs = clock.time * 1000;
  const clipDurationMs = Math.max(0, clock.duration * 1000);
  if (clipDurationMs <= 0) {
    return 1;
  }

  const fadeIn = clip.fadeInMs > 0 ? clampNumber(localTimeMs / clip.fadeInMs, 0, 1) : 1;
  const fadeOut =
    clip.fadeOutMs > 0 ? clampNumber((clipDurationMs - localTimeMs) / clip.fadeOutMs, 0, 1) : 1;
  return clampNumber(Math.min(fadeIn, fadeOut), 0, 1);
}

export function getClipVisualOpacity(clip: VideoProjectClip, currentTime: number): number {
  return clampNumber(clip.transform.opacity * getClipFadeMultiplier(clip, currentTime), 0, 1);
}

export function getClipAudioGain(clip: VideoProjectClip, currentTime: number): number {
  if (clip.muted) {
    return 0;
  }

  if (
    clip.playbackWindow &&
    (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
    getClipPlaybackOffset(clip, currentTime) * normalizeClipPlaybackRate(clip.playbackRate ?? 1) >=
      clip.sourceDuration
  )
    return 0;
  const phase = clip.playbackWindow?.gainPhase;
  const clipDurationMs = Math.max(0, (phase?.duration ?? clip.duration) * 1000);
  const localTimeMs = clampNumber(
    ((phase?.offset ?? 0) + currentTime - clip.startTime) * 1000,
    0,
    clipDurationMs
  );
  const progress = clipDurationMs <= 0 ? 0 : clampNumber(localTimeMs / clipDurationMs, 0, 1);
  const range = getClipGainRange(clip);
  const fade = fadeClock(clip, currentTime, false);
  const envelopeGain = range.start + (range.end - range.start) * progress;

  return clampNumber(
    envelopeGain *
      getAudioFadeFactor(
        { duration: fade.duration, fadeIn: clip.fadeInMs / 1000, fadeOut: clip.fadeOutMs / 1000 },
        fade.time
      ),
    0,
    2
  );
}

export function getClipCompositeVisualOpacity(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): number {
  const transitionState = resolveClipTransitionVisualState(project, clip, currentTime);
  return clampNumber(
    getClipVisualOpacity(clip, currentTime) * transitionState.opacityMultiplier,
    0,
    1
  );
}

export function getClipCompositeAudioGain(
  project: VideoProject,
  clip: VideoProjectClip,
  currentTime: number
): number {
  return clampNumber(
    getClipAudioGain(clip, currentTime) *
      getProjectTrackAudioVolume(project, clip.trackId) *
      sourceAudioGainAtTime(getProjectSourceAudioRanges(project, clip), currentTime) *
      sourceAudioAttenuationAtTime(getProjectOriginalAudioRanges(project, clip), currentTime) *
      resolveClipTransitionAudioMultiplier(project, clip, currentTime),
    0,
    8
  );
}
