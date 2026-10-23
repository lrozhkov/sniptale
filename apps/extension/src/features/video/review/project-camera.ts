import { resolveVideoProjectCameraPlacement } from '../project/camera/placement';
import type {
  VideoProject,
  VideoProjectAsset,
  VideoProjectVideoClip,
} from '../project/types/model';
import type { VideoProjectTrack } from '../project/types/layout';
import { isVideoProjectAsset } from '../project/validation/assets';
import { isVideoProjectTrack } from '../project/validation/tracks';
import type { QuickEditWebcam, QuickEditWebcamPlacement } from './advanced/webcam';
import type { ReviewProjectTimelinePlan } from './project-timeline';

/** Admitted camera media and the translated camera track supplied by the workflow. */
export interface ReviewProjectCameraResource {
  reviewAssetId: string;
  asset: VideoProjectAsset;
  track: VideoProjectTrack;
}

/** Preserve authored main-source settings independently of decoder coverage. */
export function planReviewProjectCamera(args: {
  operationId: string;
  webcam: QuickEditWebcam | undefined;
  resource: ReviewProjectCameraResource | undefined;
  applied: boolean;
  scene: { width: number; height: number };
  timeline: ReviewProjectTimelinePlan;
}): {
  assets: VideoProjectAsset[];
  tracks: VideoProjectTrack[];
  clips: VideoProjectVideoClip[];
} | null {
  const { webcam, resource } = args;
  if (!webcam) return resource ? null : { assets: [], tracks: [], clips: [] };
  if (
    !resource ||
    resource.reviewAssetId !== webcam.assetId ||
    !/^project-asset:\S{1,242}$/u.test(resource.reviewAssetId) ||
    !isVideoProjectAsset(resource.asset) ||
    resource.asset.type !== 'VIDEO' ||
    !resource.asset.id ||
    resource.asset.source.kind !== 'project-asset' ||
    resource.asset.source.projectAssetId !==
      resource.reviewAssetId.slice('project-asset:'.length) ||
    !Number.isInteger(resource.asset.metadata.width) ||
    resource.asset.metadata.width <= 0 ||
    !Number.isInteger(resource.asset.metadata.height) ||
    resource.asset.metadata.height <= 0 ||
    resource.asset.metadata.duration === null ||
    resource.asset.metadata.duration <= 0 ||
    !resource.asset.metadata.mimeType.startsWith('video/') ||
    !isVideoProjectTrack(resource.track) ||
    !resource.track.id ||
    resource.track.kind !== 'PRIMARY' ||
    resource.track.role !== 'CAMERA' ||
    resource.track.isRoot ||
    resource.track.locked
  )
    return null;
  const transform = (placement: QuickEditWebcamPlacement) => ({
    x: placement.x * args.scene.width,
    y: placement.y * args.scene.height,
    width: placement.width * args.scene.width,
    height: placement.height * args.scene.height,
    rotation: 0,
    opacity: 1,
  });
  const clips = args.timeline.videoClips.map((primary, index): VideoProjectVideoClip => {
    const groupId = primary.groupId ?? `${args.operationId}:group:${index}`;
    return {
      id: `${args.operationId}:camera:${index}`,
      type: 'VIDEO',
      name: resource.asset.name,
      trackId: resource.track.id,
      assetId: resource.asset.id,
      sourceInstanceId: `${args.operationId}:camera-source`,
      startTime: primary.startTime,
      duration: primary.duration,
      sourceStart: primary.sourceStart,
      sourceDuration: primary.sourceDuration,
      playbackRate: primary.playbackRate ?? 1,
      groupId,
      linkMode: 'LINKED',
      muted: true,
      volume: 1,
      audioGainStart: 1,
      audioGainEnd: 1,
      volumeEnvelopeStart: 1,
      volumeEnvelopeEnd: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      fitMode: 'COVER',
      transform: transform(webcam.placement),
      cameraTiming: { offsetSeconds: webcam.offsetSeconds, transitions: 'bounded' },
      cameraAppearance: structuredClone(webcam.appearance),
      cameraMirrored: webcam.mirrored,
      cameraHiddenRanges: structuredClone(webcam.hiddenRanges),
      cameraPositions: webcam.positions.map((position) => ({
        id: position.id,
        sourceTime: position.time,
        transform: transform(position.placement),
        fitMode: 'COVER',
        ...(position.crop ? { crop: structuredClone(position.crop) } : {}),
        transition: {
          kind:
            position.transition.type === 'none'
              ? 'instant'
              : position.transition.type === 'ease-in-out'
                ? 'smooth'
                : 'shrink',
          duration: position.transition.duration,
        },
      })),
      ...(webcam.shadow
        ? {
            shadowIntensity: webcam.shadow.intensity,
            shadowColor: webcam.shadow.color,
            shadowMode: 'BACKDROP',
          }
        : {}),
    };
  });
  return {
    assets: [structuredClone(resource.asset)],
    tracks: [{ ...structuredClone(resource.track), visible: args.applied }],
    clips,
  };
}

/** Admit only the unedited recording sidecar that Gallery does not apply itself. */
export function isNeutralReviewSeedCamera(
  seed: VideoProject,
  clip: VideoProjectVideoClip,
  primary: VideoProjectVideoClip
): boolean {
  const asset = seed.assets.find((entry) => entry.id === clip.assetId);
  const main = seed.assets.find((entry) => entry.id === primary.assetId);
  const track = seed.tracks.find((entry) => entry.id === clip.trackId);
  if (
    !asset ||
    asset.recordingPart?.role !== 'camera' ||
    asset.recordingPart.recordingId !== main?.recordingPart?.recordingId ||
    track?.role !== 'CAMERA' ||
    !track.visible ||
    track.locked ||
    track.isRoot
  )
    return false;
  const placement = resolveVideoProjectCameraPlacement({
    placement: 'BOTTOM_RIGHT',
    projectHeight: seed.height,
    projectWidth: seed.width,
    sourceHeight: asset.metadata.height,
    sourceWidth: asset.metadata.width,
  });
  const allowed = new Set([
    'id',
    'trackId',
    'type',
    'name',
    'groupId',
    'linkMode',
    'startTime',
    'duration',
    'muted',
    'volume',
    'audioGainStart',
    'audioGainEnd',
    'volumeEnvelopeStart',
    'volumeEnvelopeEnd',
    'fadeInMs',
    'fadeOutMs',
    'transitionIn',
    'transitionOut',
    'assetId',
    'sourceInstanceId',
    'sourceStart',
    'sourceDuration',
    'playbackRate',
    'fitMode',
    'fitScalePercent',
    'windowCornerRadius',
    'shadowIntensity',
    'shadowColor',
    'shadowMode',
    'transform',
  ]);
  return (
    Object.keys(clip).every((key) => allowed.has(key)) &&
    clip.startTime === 0 &&
    clip.sourceStart === 0 &&
    clip.duration === Math.min(primary.duration, asset.metadata.duration ?? 0) &&
    clip.sourceDuration === clip.duration &&
    (clip.playbackRate ?? 1) === 1 &&
    clip.groupId === primary.groupId &&
    clip.linkMode === (clip.groupId ? 'LINKED' : 'DETACHED') &&
    clip.muted &&
    clip.volume === 1 &&
    clip.audioGainStart === 1 &&
    clip.audioGainEnd === 1 &&
    clip.volumeEnvelopeStart === 1 &&
    clip.volumeEnvelopeEnd === 1 &&
    clip.fadeInMs === 0 &&
    clip.fadeOutMs === 0 &&
    clip.transitionIn === 'NONE' &&
    clip.transitionOut === 'NONE' &&
    clip.fitMode === 'SOURCE_100' &&
    clip.fitScalePercent === 100 &&
    clip.windowCornerRadius === undefined &&
    clip.shadowColor === undefined &&
    clip.shadowIntensity === 0 &&
    clip.shadowMode === 'BACKDROP' &&
    clip.transform.x === placement.x &&
    clip.transform.y === placement.y &&
    clip.transform.width === placement.width &&
    clip.transform.height === placement.height &&
    clip.transform.rotation === 0 &&
    clip.transform.opacity === 1
  );
}
