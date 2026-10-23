import type { VideoProject, VideoProjectEffectClip, VideoProjectTrack } from '../project/types';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../project/effect-instance/types';
import type { ReviewAnnotationEffects } from './annotation-effects/types';
import {
  readReviewAnnotationEffectDocument,
  reviewAnnotationEffectMatchesDocument,
} from './annotation-effects/validation';
import { projectReviewAnnotationEffect } from './annotation-effects/timing';
import type { ReviewTimeSegment } from './time-segment';

/** Materializes authored annotations as ordinary Native hosts without acquiring resources. */
export function planReviewProjectAnnotations(args: {
  operationId: string;
  annotations: ReviewAnnotationEffects | undefined;
  snapshots: readonly VideoProjectEffectSnapshot[];
  segments: readonly ReviewTimeSegment[];
  source: { width: number; height: number; assetId: string; sourceInstanceId: string };
  scene: { width: number; height: number };
  visible: boolean;
  tracks: VideoProject['tracks'];
}): {
  clips: VideoProjectEffectClip[];
  instances: VideoProjectEffectInstance[];
  snapshots: VideoProjectEffectSnapshot[];
  tracks: VideoProjectTrack[];
} | null {
  const result = {
    clips: [] as VideoProjectEffectClip[],
    instances: [] as VideoProjectEffectInstance[],
    snapshots: [] as VideoProjectEffectSnapshot[],
    tracks: [] as VideoProjectTrack[],
  };
  const annotations = args.annotations;
  if (!annotations) return result;
  const firstOrder = Math.min(0, ...args.tracks.map((track) => track.order)) - 1;
  for (const [index, annotation] of annotations.instances.entries()) {
    const snapshot = args.snapshots.find((entry) => entry.id === annotation.snapshotId);
    const document = snapshot && readReviewAnnotationEffectDocument(snapshot.source);
    if (!snapshot || !document || !reviewAnnotationEffectMatchesDocument(annotation, document))
      return null;
    const projection = projectReviewAnnotationEffect(annotation, args.segments);
    const dormant = projection.slices.length === 0;
    const sourceSegment = args.segments.find(
      (segment) => annotation.start >= segment.sourceStart && annotation.start < segment.sourceEnd
    );
    const startTime =
      projection.slices[0]?.start ??
      sourceSegment?.resultStart ??
      args.segments.at(-1)?.resultEnd ??
      0;
    const duration = dormant ? annotation.end - annotation.start : projection.duration;
    const plane = annotation.attachment === 'content' ? args.source : args.scene;
    const trackId = `${args.operationId}:annotation:${index}`;
    const name = document.label.en ?? document.id;
    result.tracks.push({
      id: trackId,
      name,
      kind: 'PRIMARY',
      order: firstOrder - index,
      visible: args.visible && annotations.enabled,
      locked: false,
    });
    if (!result.snapshots.some((entry) => entry.id === snapshot.id))
      result.snapshots.push(structuredClone(snapshot));
    const id = `${trackId}:0`;
    result.instances.push({
      id,
      kind: 'standalone',
      target: { kind: 'scene' },
      snapshotId: snapshot.id,
      controls: structuredClone(annotation.controls),
      enabled: annotation.enabled,
      startTime,
      duration,
      playbackRate: document.duration / duration,
      sourceStart: 0,
      ...(annotation.anchors
        ? {
            sceneAnchors: Object.fromEntries(
              Object.entries(annotation.anchors).map(([key, point]) => [
                key,
                { x: point.x * plane.width, y: point.y * plane.height },
              ])
            ),
          }
        : {}),
    });
    result.clips.push({
      id: `${id}:host`,
      effectInstanceId: id,
      trackId,
      name,
      type: 'EFFECT',
      sourceRange: {
        assetId: args.source.assetId,
        sourceInstanceId: args.source.sourceInstanceId,
        start: annotation.start,
        end: annotation.end,
        ...(dormant ? { dormant: true as const } : {}),
      },
      attachment:
        annotation.attachment === 'content'
          ? {
              kind: 'source',
              assetId: args.source.assetId,
              sourceInstanceId: args.source.sourceInstanceId,
            }
          : { kind: 'viewport' },
      groupId: null,
      linkMode: 'DETACHED',
      startTime,
      duration,
      muted: true,
      volume: 1,
      volumeEnvelopeStart: 1,
      volumeEnvelopeEnd: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      transform: {
        x: annotation.transform.x * plane.width,
        y: annotation.transform.y * plane.height,
        width: annotation.transform.width * plane.width,
        height: annotation.transform.height * plane.height,
        rotation: (annotation.transform.rotation * 180) / Math.PI,
        opacity: 1,
      },
    });
  }
  return result;
}
