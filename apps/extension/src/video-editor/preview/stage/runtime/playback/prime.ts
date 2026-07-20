import {
  getMediaClipSourceTime,
  getVideoClipSourceTime,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../../../features/video/project/timeline';
import { normalizeClipPlaybackRate } from '../../../../../features/video/project/timeline/rate';
import type { VideoProjectClip } from '../../../../../features/video/project/types/index';
import type {
  PreviewStageAudioBankClip,
  PreviewStageAudioRefs,
  PreviewStageVideoRefs,
} from '../../types';
import { applyPreviewPitchPreservation } from './pitch';

const MEDIA_READY_FOR_CURRENT_FRAME = 2;
const PREVIEW_STAGE_PRIMING_TIMEOUT_MS = 180;

export interface PreviewStagePlaybackPrepareState {
  audioBankClips: PreviewStageAudioBankClip[];
  audioRefs: PreviewStageAudioRefs;
  videoBankClips: VideoProjectClip[];
  videoRefs: PreviewStageVideoRefs;
}

function setPreparedMediaTime(media: HTMLMediaElement, time: number): void {
  if (!Number.isFinite(time)) return;
  try {
    media.currentTime = time;
  } catch {
    // Some media elements reject pre-metadata seeks; readiness is checked below.
  }
}

function prepareAudioDrivers(
  clips: PreviewStageAudioBankClip[],
  refs: PreviewStageAudioRefs,
  time: number
): void {
  for (const clip of clips) {
    const audio = refs.current[clip.id];
    if (!audio) continue;
    applyPreviewPitchPreservation(audio);
    audio.playbackRate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
    setPreparedMediaTime(audio, getMediaClipSourceTime(clip, time));
    audio.pause();
  }
}

function prepareVideoDrivers(
  clips: VideoProjectClip[],
  refs: PreviewStageVideoRefs,
  time: number
): void {
  for (const clip of clips) {
    if (!isVideoClip(clip)) continue;
    const video = refs.current[clip.id];
    if (!video) continue;
    video.defaultMuted = true;
    video.muted = true;
    video.volume = 0;
    video.playbackRate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
    setPreparedMediaTime(video, getVideoClipSourceTime(clip, time));
    video.pause();
  }
}

function isPreparedMediaReady(media: HTMLMediaElement): boolean {
  return media.readyState >= MEDIA_READY_FOR_CURRENT_FRAME && Number.isFinite(media.currentTime);
}

function waitForPreparedMedia(media: HTMLMediaElement[]): Promise<void> {
  if (media.every(isPreparedMediaReady)) return Promise.resolve();
  return new Promise((resolve) => {
    let resolved = false;
    const listeners: Array<() => void> = [];
    const settle = () => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      listeners.forEach((removeListener) => removeListener());
      resolve();
    };
    const handleProgress = () => {
      if (media.every(isPreparedMediaReady)) settle();
    };
    const timeoutId = window.setTimeout(settle, PREVIEW_STAGE_PRIMING_TIMEOUT_MS);
    for (const element of media) {
      for (const eventName of ['loadeddata', 'canplay', 'seeked'] as const) {
        element.addEventListener(eventName, handleProgress);
        listeners.push(() => element.removeEventListener(eventName, handleProgress));
      }
    }
    handleProgress();
  });
}

function waitForPreviewStageFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function isPreparedMediaElement<Media extends HTMLMediaElement>(
  media: Media | null | undefined
): media is Media {
  return media !== null && media !== undefined && typeof media.readyState === 'number';
}

function resolveRequiredPreparedMedia(
  state: PreviewStagePlaybackPrepareState,
  time: number
): HTMLMediaElement[] {
  const requiredAudio = state.audioBankClips
    .filter((clip) => isClipActiveAtTime(clip, time))
    .map((clip) => state.audioRefs.current[clip.id])
    .filter(isPreparedMediaElement);
  const requiredVideo = state.videoBankClips
    .filter((clip) => isVideoClip(clip) && isClipActiveAtTime(clip, time))
    .map((clip) => state.videoRefs.current[clip.id])
    .filter(isPreparedMediaElement);
  return [...requiredAudio, ...requiredVideo];
}

export async function preparePreviewStagePlayback(
  state: PreviewStagePlaybackPrepareState,
  time: number
): Promise<void> {
  await waitForPreviewStageFrame();
  prepareAudioDrivers(state.audioBankClips, state.audioRefs, time);
  prepareVideoDrivers(state.videoBankClips, state.videoRefs, time);
  await waitForPreparedMedia(resolveRequiredPreparedMedia(state, time));
}
