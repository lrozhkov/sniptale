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

type CursorContext = NonNullable<QuickEditZoomRegion['cursorFocus']>;
type CursorPath = CursorContext['path'];
/** Capture isolated scenes while retaining immutable native camera data within one renderer. */
export function createReviewPreviewSceneCapture(): (scene: PreviewScene) => PreviewScene {
  const contexts = new WeakMap<CursorContext, CursorContext>();
  const segments = new WeakMap<CursorPath['segments'], CursorPath['segments']>();
  const capturePath = (path: CursorPath): CursorPath => {
    let captured = segments.get(path.segments);
    if (!captured) {
      captured = structuredClone(path.segments);
      segments.set(path.segments, captured);
    }
    return { ...structuredClone({ ...path, segments: [] }), segments: captured };
  };
  const captureContext = (context: CursorContext): CursorContext => {
    let captured = contexts.get(context);
    if (!captured) {
      const { path, observed, ...metadata } = context;
      captured = {
        ...structuredClone(metadata),
        path: capturePath(path),
        ...(observed ? { observed: capturePath(observed) } : {}),
      };
      contexts.set(context, captured);
    }
    return captured;
  };
  return (scene) => ({
    ...structuredClone({ ...scene, zoomRegions: [] }),
    zoomRegions: scene.zoomRegions.map(({ cursorFocus, ...region }) => ({
      ...structuredClone(region),
      ...(cursorFocus ? { cursorFocus: captureContext(cursorFocus) } : {}),
    })),
  });
}

type PathKey = { metadata: string; segments: string };
type CameraKey = {
  value: string;
  paths: readonly ({ path: PathKey; observed: PathKey | undefined } | null)[];
};
const cameraKeys = new WeakMap<readonly QuickEditZoomRegion[], CameraKey>();
const cursorSegments = new WeakMap<CursorPath['segments'], string>();

/** Native segments are immutable derived inputs; scalar authoring changes use a separate key. */
function cursorPathKey(path: CursorPath): PathKey {
  let key = cursorSegments.get(path.segments);
  if (key === undefined) {
    key = JSON.stringify(path.segments, orderedSceneValue);
    cursorSegments.set(path.segments, key);
  }
  const { segments: _segments, ...metadata } = path;
  return { metadata: JSON.stringify(metadata, orderedSceneValue), segments: key };
}

function samePathKey(left: PathKey | undefined, right: PathKey | undefined): boolean {
  return left?.metadata === right?.metadata && left?.segments === right?.segments;
}

function sameCameraKey(left: CameraKey, right: CameraKey): boolean {
  return (
    left === right ||
    (left.value === right.value &&
      left.paths.length === right.paths.length &&
      left.paths.every((path, index) => {
        const other = right.paths[index];
        return samePathKey(path?.path, other?.path) && samePathKey(path?.observed, other?.observed);
      }))
  );
}

function orderedSceneValue(_key: string, value: unknown): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
    : value;
}

/** Camera projection emits immutable region arrays; replacement invalidates their retained key. */
export type PreviewSceneKey = { content: string; camera: CameraKey; context: string };

export function reviewPreviewSceneKey(scene: PreviewScene, context?: unknown): PreviewSceneKey {
  let cameraKey = cameraKeys.get(scene.zoomRegions);
  if (cameraKey === undefined) {
    cameraKey = {
      value: JSON.stringify(
        scene.zoomRegions.map(({ cursorFocus, ...region }) => ({
          ...region,
          ...(cursorFocus
            ? { cursorFocus: { ...cursorFocus, path: undefined, observed: undefined } }
            : {}),
        })),
        orderedSceneValue
      ),
      paths: scene.zoomRegions.map((region) =>
        region.cursorFocus
          ? {
              path: cursorPathKey(region.cursorFocus.path),
              observed: region.cursorFocus.observed
                ? cursorPathKey(region.cursorFocus.observed)
                : undefined,
            }
          : null
      ),
    };
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
    sameCameraKey(left.camera, right.camera) &&
    left.content === right.content &&
    left.context === right.context
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
