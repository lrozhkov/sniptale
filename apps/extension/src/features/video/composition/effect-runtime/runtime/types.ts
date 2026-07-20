import type {
  VideoProjectEffectSnapshotAsset,
  VideoProjectEffectTarget,
} from '../../../project/effect-instance/types';

export interface EffectRuntimeFrameDimensions {
  height: number;
  width: number;
}

export interface EffectRuntimeFramePlacement extends EffectRuntimeFrameDimensions {
  opacity: number;
  rotation: number;
  x: number;
  y: number;
}

type EffectRuntimeFrameTarget =
  | { clipId: string; kind: 'scene' }
  | {
      chainIndex: number;
      clipId: string;
      kind: 'clip';
      placement: EffectRuntimeFramePlacement;
    }
  | {
      kind: 'transition';
      leadingClipId: string;
      trailingClipId: string;
      transitionId: string;
    };

export interface EffectRuntimeFramePlan {
  assets: readonly VideoProjectEffectSnapshotAsset[];
  controls: Readonly<Record<string, number | string>>;
  dimensions: EffectRuntimeFrameDimensions;
  documentSha256: string;
  documentSource: string;
  duration: number;
  effectInstanceId: string;
  fps: number;
  frameIndex: number;
  kind: 'standalone' | 'targetEffect' | 'transition';
  progress: number;
  renderDimensions: EffectRuntimeFrameDimensions;
  snapshotId: string;
  target: EffectRuntimeFrameTarget;
  time: number;
}

export interface EffectRuntimeRenderedFrame {
  bitmap: ImageBitmap;
  effectInstanceId: string;
  height: number;
  kind: EffectRuntimeFramePlan['kind'];
  logicalHeight: number;
  logicalWidth: number;
  snapshotId: string;
  target: EffectRuntimeFrameTarget;
  width: number;
}

export type EffectRuntimeRenderedFrameMap = ReadonlyMap<string, EffectRuntimeRenderedFrame>;

export interface EffectRuntimeRenderedComposition {
  framesByTime: ReadonlyMap<number, EffectRuntimeRenderedFrameMap>;
  overlayFrames: EffectRuntimeRenderedFrameMap;
}

export function isSameEffectTarget(
  left: VideoProjectEffectTarget,
  right: VideoProjectEffectTarget
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'scene') return true;
  if (left.kind === 'clip' && right.kind === 'clip') return left.clipId === right.clipId;
  return (
    left.kind === 'transition' &&
    right.kind === 'transition' &&
    left.transitionId === right.transitionId
  );
}
