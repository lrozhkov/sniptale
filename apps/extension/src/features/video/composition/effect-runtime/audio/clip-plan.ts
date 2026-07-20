import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshotAsset,
} from '../../../project/effect-instance/types';
import type { EffectRuntimeAudioPlan } from './types';

type EffectClip = EffectV1Document['clips'][number];
type EffectLayer = EffectV1Document['layers'][number];

export function createEffectRuntimeAudioClipPlan(args: {
  asset: VideoProjectEffectSnapshotAsset;
  clip: EffectClip;
  documentDuration: number;
  index: number;
  instance: VideoProjectEffectInstance;
  layer: EffectLayer;
  sceneEnabled: boolean;
  targetInterval?: { end: number; start: number };
}): EffectRuntimeAudioPlan | null {
  if (args.clip.enabled === false || !args.sceneEnabled) return null;
  const localStart = Math.max(0, args.clip.start);
  const localEnd = Math.min(args.documentDuration, args.clip.start + args.clip.duration);
  if (localEnd <= localStart) return null;
  const startTime = args.instance.startTime + localStart / args.instance.playbackRate;
  const instanceEnd = args.instance.startTime + args.instance.duration;
  const endTime = Math.min(
    instanceEnd,
    args.instance.startTime + localEnd / args.instance.playbackRate
  );
  if (endTime <= startTime) return null;
  const boundedStartTime = Math.max(startTime, args.targetInterval?.start ?? startTime);
  const boundedEndTime = Math.min(endTime, args.targetInterval?.end ?? endTime);
  if (boundedEndTime <= boundedStartTime) return null;
  return buildAudioPlan(args, {
    boundedEndTime,
    boundedStartTime,
    localStart,
    startTime,
  });
}

function buildAudioPlan(
  args: Parameters<typeof createEffectRuntimeAudioClipPlan>[0],
  timing: {
    boundedEndTime: number;
    boundedStartTime: number;
    localStart: number;
    startTime: number;
  }
): EffectRuntimeAudioPlan {
  const duration = timing.boundedEndTime - timing.boundedStartTime;
  const sourceStart =
    Math.max(0, args.clip.offset ?? 0) +
    Math.max(0, timing.localStart - args.clip.start) +
    (timing.boundedStartTime - timing.startTime) * args.instance.playbackRate;
  return {
    assetBlob: args.asset.blob,
    assetCacheKey: `${args.instance.snapshotId}:${args.asset.id}:${args.asset.sha256}`,
    assetMimeType: args.asset.mimeType,
    audioGainEnd: 1,
    audioGainStart: 1,
    duration,
    effectInstanceId: args.instance.id,
    fadeInMs: 0,
    fadeOutMs: 0,
    id: `${args.instance.id}:${args.layer.id}:${args.index}`,
    muted: false,
    playbackRate: args.instance.playbackRate,
    snapshotId: args.instance.snapshotId,
    sourceDuration: duration * args.instance.playbackRate,
    sourceKind: 'effect-snapshot',
    sourceStart,
    startTime: timing.boundedStartTime,
    volume: clampUnit(args.layer['volume'], 1),
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  };
}

function clampUnit(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, numeric));
}
