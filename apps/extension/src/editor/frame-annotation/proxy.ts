import { config, Point, Rect, type FabricObject } from 'fabric';
import {
  createFrameAnnotationSnapshot,
  parseSerializedFrameAnnotationSnapshot,
  serializeFrameAnnotationSnapshot,
  type FrameAnnotationSnapshotV1,
  type FrameAnnotationVisualState,
} from '../../features/highlighter/frame-annotation';
import { applyAutoStepBadgeValues } from '../../features/highlighter/frame-annotation/step-badge/auto-values';

const snapshotCache = new WeakMap<
  FabricObject,
  {
    json: string | undefined;
    snapshot: FrameAnnotationSnapshotV1 | null;
  }
>();

export const FRAME_ANNOTATION_PROXY_FILL = 'rgba(0,0,0,0.001)';

export function createFrameAnnotationProxy(options: {
  frame: FrameAnnotationVisualState;
  ordering: number;
  label: string;
}): FabricObject {
  const snapshot = normalizeFrameAnnotationProxySnapshot(
    createFrameAnnotationSnapshot(options.frame, options.ordering)
  );
  const proxy = new Rect({
    left: snapshot.x,
    top: snapshot.y,
    width: snapshot.width,
    height: snapshot.height,
    originX: 'left',
    originY: 'top',
    fill: FRAME_ANNOTATION_PROXY_FILL,
    strokeWidth: 0,
    objectCaching: false,
    selectable: false,
    evented: false,
    hasBorders: false,
    hasControls: false,
  });
  proxy.sniptaleId = snapshot.id;
  proxy.sniptaleType = 'frame-annotation';
  proxy.sniptaleRole = 'annotation';
  proxy.sniptaleLabel = options.label;
  proxy.sniptaleFrameAnnotationRevision = 1;
  proxy.sniptaleFrameAnnotationJson = serializeFrameAnnotationSnapshot(snapshot);
  return proxy;
}

/** Reuses parsing while the serialized metadata value is unchanged. */
export function readFrameAnnotationSnapshot(
  object: FabricObject
): FrameAnnotationSnapshotV1 | null {
  if (object.sniptaleType !== 'frame-annotation') return null;
  const json = object.sniptaleFrameAnnotationJson;
  const cached = snapshotCache.get(object);
  if (cached && cached.json === json) return cached.snapshot;
  const snapshot = parseSerializedFrameAnnotationSnapshot(json);
  snapshotCache.set(object, { json, snapshot });
  return snapshot;
}

/** Reads visible scene geometry, including a transient native selection transform. */
function readFrameAnnotationSceneSnapshot(object: FabricObject): FrameAnnotationSnapshotV1 | null {
  const snapshot = readFrameAnnotationSnapshot(object);
  if (!snapshot) return null;
  const position = object.getXY();
  const scale = object.getObjectScaling();
  const width = object.width * scale.x;
  const height = object.height * scale.y;
  if (
    position.x === snapshot.x &&
    position.y === snapshot.y &&
    width === snapshot.width &&
    height === snapshot.height
  )
    return snapshot;
  return { ...snapshot, x: position.x, y: position.y, width, height };
}

/** Commits native scene coordinates without changing selection-local object transforms. */
export function synchronizeFrameAnnotationProxyTransform(object: FabricObject): boolean {
  const snapshot = readFrameAnnotationSceneSnapshot(object);
  if (!snapshot) return false;
  const normalized = normalizeFrameAnnotationProxySnapshot(snapshot);
  const json = serializeFrameAnnotationSnapshot(normalized);
  if (json === object.sniptaleFrameAnnotationJson) return false;
  object.sniptaleFrameAnnotationJson = json;
  object.sniptaleFrameAnnotationRevision =
    Math.max(0, object.sniptaleFrameAnnotationRevision ?? 0) + 1;
  return true;
}

export function commitFrameAnnotationProxy(
  object: FabricObject,
  snapshot: FrameAnnotationSnapshotV1
): void {
  const normalized = normalizeFrameAnnotationProxySnapshot(
    createFrameAnnotationSnapshot(snapshot, snapshot.ordering)
  );
  const revision = Math.max(0, Math.trunc(object.sniptaleFrameAnnotationRevision ?? 0)) + 1;
  object.set({
    width: normalized.width,
    height: normalized.height,
    scaleX: 1,
    scaleY: 1,
  });
  object.setXY(new Point(normalized.x, normalized.y), 'left', 'top');
  object.sniptaleFrameAnnotationRevision = revision;
  object.sniptaleFrameAnnotationJson = serializeFrameAnnotationSnapshot(normalized);
  object.setCoords();
}

export function shiftFrameAnnotationProxyForCrop(
  object: FabricObject,
  offset: { left: number; top: number }
): boolean {
  const snapshot = readFrameAnnotationSnapshot(object);
  if (!snapshot) return false;
  commitFrameAnnotationProxy(object, {
    ...snapshot,
    x: snapshot.x - offset.left,
    y: snapshot.y - offset.top,
  });
  return true;
}

function normalizeFrameAnnotationProxySnapshot(
  snapshot: FrameAnnotationSnapshotV1
): FrameAnnotationSnapshotV1 {
  return {
    ...snapshot,
    x: roundToFabricSerializationPrecision(snapshot.x),
    y: roundToFabricSerializationPrecision(snapshot.y),
    width: roundToFabricSerializationPrecision(snapshot.width),
    height: roundToFabricSerializationPrecision(snapshot.height),
  };
}

function roundToFabricSerializationPrecision(value: number): number {
  const precision = Math.max(0, Math.trunc(config.NUM_FRACTION_DIGITS));
  return Number(value.toFixed(precision));
}

export function normalizeFrameAnnotationProxyGeometry(
  object: FabricObject
): FrameAnnotationSnapshotV1 | null {
  const snapshot = readFrameAnnotationSceneSnapshot(object);
  if (!snapshot) return null;
  const next = createFrameAnnotationSnapshot(snapshot, snapshot.ordering);
  commitFrameAnnotationProxy(object, next);
  return next;
}

export function restoreFrameAnnotationProxyFromMetadata(object: FabricObject): boolean {
  const snapshot = readFrameAnnotationSnapshot(object);
  if (
    !snapshot ||
    !(object instanceof Rect) ||
    object.sniptaleId !== snapshot.id ||
    object.sniptaleRole !== 'annotation'
  )
    return false;
  const visible = object.visible !== false;
  object.set({
    left: snapshot.x,
    top: snapshot.y,
    width: snapshot.width,
    height: snapshot.height,
    scaleX: 1,
    scaleY: 1,
    selectable: false,
    evented: false,
    hasBorders: false,
    hasControls: false,
    fill: FRAME_ANNOTATION_PROXY_FILL,
    stroke: null,
    strokeWidth: 0,
    opacity: 1,
    shadow: null,
    visible,
  });
  object.setCoords();
  return true;
}

export function collectFrameAnnotationProxies(objects: FabricObject[]): Array<{
  object: FabricObject;
  snapshot: FrameAnnotationSnapshotV1;
}> {
  return objects
    .map((object) => ({ object, snapshot: readFrameAnnotationSceneSnapshot(object) }))
    .filter(
      (entry): entry is { object: FabricObject; snapshot: FrameAnnotationSnapshotV1 } =>
        entry.snapshot !== null && entry.object.visible !== false
    )
    .sort((left, right) => left.snapshot.ordering - right.snapshot.ordering);
}

export function canMutateFrameAnnotationProxy(object: FabricObject): boolean {
  return object.visible !== false && object.sniptaleLocked !== true;
}

export function synchronizeFrameAnnotationOrdering(objects: FabricObject[]): void {
  objects
    .map((object) => ({ object, snapshot: readFrameAnnotationSnapshot(object) }))
    .filter(
      (entry): entry is { object: FabricObject; snapshot: FrameAnnotationSnapshotV1 } =>
        entry.snapshot !== null
    )
    .forEach((entry, ordering) => {
      if (entry.snapshot.ordering !== ordering) {
        commitFrameAnnotationProxy(entry.object, { ...entry.snapshot, ordering });
      }
    });
  synchronizeFrameAnnotationAutoStepBadges(objects);
}

export function synchronizeFrameAnnotationAutoStepBadges(objects: FabricObject[]): void {
  const entries = collectFrameAnnotationProxies(objects);
  const normalized = applyAutoStepBadgeValues(entries.map((entry) => entry.snapshot));
  normalized.forEach((snapshot, index) => {
    const entry = entries[index];
    if (entry && snapshot !== entry.snapshot) commitFrameAnnotationProxy(entry.object, snapshot);
  });
}
