import { DEFAULT_CLIP_FADE_MS, DEFAULT_CLIP_VOLUME } from '../defaults';
import { normalizeAnnotationClipFields } from './annotation';
import { getClipGainRange, normalizeClipPlaybackRate } from '../timeline/basics';
import { normalizeVideoProjectClipLogicalLaneId } from '../timeline/logical-lanes';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectClipType,
  type VideoProject,
} from '../types/index';

function normalizeClipPlayback(clip: VideoProject['clips'][number]) {
  if (clip.type !== VideoProjectClipType.VIDEO && clip.type !== VideoProjectClipType.AUDIO) {
    return {};
  }

  const playbackRate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  const sourceDuration = Math.max(0.1, clip.sourceDuration);

  return {
    playbackRate,
    sourceDuration,
    duration: sourceDuration / playbackRate,
  };
}

function resolveClipLinkMode(clip: VideoProject['clips'][number]) {
  if (clip.linkMode) {
    return clip.linkMode;
  }

  if (
    clip.groupId &&
    (clip.type === VideoProjectClipType.VIDEO || clip.type === VideoProjectClipType.AUDIO)
  ) {
    return VideoClipLinkMode.LINKED;
  }

  return VideoClipLinkMode.DETACHED;
}

function resolveClipFitFields(clip: VideoProject['clips'][number]) {
  if (clip.type !== VideoProjectClipType.VIDEO && clip.type !== VideoProjectClipType.IMAGE) {
    return {};
  }

  return {
    fitMode: clip.fitMode ?? VideoMediaFitMode.CONTAIN,
    fitScalePercent:
      typeof clip.fitScalePercent === 'number' ? Math.max(1, clip.fitScalePercent) : 100,
    shadowIntensity: normalizeMediaShadowIntensity(clip.shadowIntensity),
    shadowMode: normalizeMediaShadowMode(clip.shadowMode),
  };
}

function normalizeMediaShadowIntensity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeMediaShadowMode(value: unknown): VideoMediaShadowMode {
  return value === VideoMediaShadowMode.GLOW
    ? VideoMediaShadowMode.GLOW
    : VideoMediaShadowMode.BACKDROP;
}

export function normalizeClip(
  clip: VideoProject['clips'][number],
  legacyClipNames: ReadonlyMap<string, string>
): VideoProject['clips'][number] {
  const gainRange = getClipGainRange(clip);

  return {
    ...clip,
    groupId: clip.groupId ?? null,
    linkMode: resolveClipLinkMode(clip),
    name: legacyClipNames.get(clip.name) ?? clip.name,
    timelineLaneId: normalizeVideoProjectClipLogicalLaneId(clip.timelineLaneId),
    volume: DEFAULT_CLIP_VOLUME,
    audioGainStart: gainRange.start,
    audioGainEnd: gainRange.end,
    volumeEnvelopeStart: gainRange.start,
    volumeEnvelopeEnd: gainRange.end,
    fadeInMs: typeof clip.fadeInMs === 'number' ? Math.max(0, clip.fadeInMs) : DEFAULT_CLIP_FADE_MS,
    fadeOutMs:
      typeof clip.fadeOutMs === 'number' ? Math.max(0, clip.fadeOutMs) : DEFAULT_CLIP_FADE_MS,
    transitionIn: clip.transitionIn ?? VideoClipTransitionKind.NONE,
    transitionOut: clip.transitionOut ?? VideoClipTransitionKind.NONE,
    ...resolveClipFitFields(clip),
    ...normalizeAnnotationClipFields(clip),
    ...normalizeClipPlayback(clip),
  } as VideoProject['clips'][number];
}
