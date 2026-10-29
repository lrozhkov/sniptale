import type { PresentationSequencePlan } from '../../features/video/review/presentation-sequence';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import type { ReviewAnnotationScene } from './annotation-renderer';

type Size = { width: number; height: number };

export type PreviewSceneDimensions = { canonical: Size; backing: Size };
export type PreviewScene = {
  annotationEffects?: Omit<ReviewAnnotationScene, 'planes'> | undefined;
  captions?:
    | {
        document: QuickEditAdvancedState['text'];
        settings: QuickEditAdvancedState['captions'];
        segments: readonly ReviewTimeSegment[];
      }
    | undefined;
  outerFadePlan?: PresentationSequencePlan | undefined;
  source: Size;
  canvas?: Size;
  background: QuickEditAdvancedState['background'];
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  watermark?: QuickEditAdvancedState['watermark'];
  webcam?: QuickEditAdvancedState['webcam'];
  webcamDuration?: number | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  comments: readonly CanvasCommentExport[];
  /** Gallery-only overlays remain visible without altering their burn-in flags. */
  showEditorComments?: boolean;
  keys: readonly ReviewKeyCue[];
  clicks: readonly ReviewClickCue[];
};

const cameraKeys = new WeakMap<readonly QuickEditZoomRegion[], string>();

function orderedSceneValue(_key: string, value: unknown): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
    : value;
}

/** Camera projection emits immutable region arrays; replacement invalidates their retained key. */
export type PreviewSceneKey = { content: string; camera: string; context: string };

export function reviewPreviewSceneKey(scene: PreviewScene, context?: unknown): PreviewSceneKey {
  let cameraKey = cameraKeys.get(scene.zoomRegions);
  if (cameraKey === undefined) {
    cameraKey = JSON.stringify(scene.zoomRegions, orderedSceneValue);
    cameraKeys.set(scene.zoomRegions, cameraKey);
  }
  return {
    content: JSON.stringify({ ...scene, zoomRegions: undefined }, orderedSceneValue),
    camera: cameraKey,
    context: JSON.stringify(context, orderedSceneValue) ?? '',
  };
}

/** Compare complete scene inputs without joining retained camera text on each frame. */
export function sameReviewPreviewSceneKey(left: PreviewSceneKey, right: PreviewSceneKey): boolean {
  return (
    left.camera === right.camera && left.content === right.content && left.context === right.context
  );
}

/** Disabled annotation instances do not participate in preparation or scene identity. */
export function activeReviewPreviewScene(source: PreviewScene): PreviewScene {
  const annotations = source.annotationEffects;
  const instances = annotations?.lane.enabled
    ? annotations.lane.instances.filter((instance) => instance.enabled)
    : [];
  const ids = new Set(instances.map((instance) => instance.snapshotId));
  return {
    ...source,
    ...(annotations
      ? {
          annotationEffects: {
            ...annotations,
            lane: { enabled: annotations.lane.enabled, instances },
            snapshots: annotations.snapshots.filter((snapshot) => ids.has(snapshot.id)),
          },
        }
      : {}),
  };
}

/** Camera motion refreshes captions but only spatial admission changes other prepared assets. */
export function reviewPreviewPreparationKey(
  scene: PreviewScene,
  dimensions: PreviewSceneDimensions,
  spatial: boolean
): string {
  return JSON.stringify([{ ...scene, zoomRegions: [] }, dimensions, spatial], orderedSceneValue);
}
