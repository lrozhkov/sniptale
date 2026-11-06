import {
  getDrawingObjectSelectionBounds,
  transformDrawingObjectPoint,
} from '../../features/drawing/public';
import type {
  DrawingBounds,
  DrawingObject,
  DrawingSimplifyObject,
  DrawingSimplifySource,
} from '../../features/drawing/public';
import type { createSimplifyComputeClient } from '../../workflows/simplify/compute-client';

function contains(source: DrawingSimplifySource, bounds: DrawingBounds): boolean {
  const outer = source.bounds;
  const sx = source.width / outer.width;
  const sy = source.height / outer.height;
  // Match raster-bound rounding: tolerate only floating drift, not missing pixels.
  const tolerance = 1e-7;
  return (
    (bounds.x - outer.x) * sx >= -tolerance &&
    (bounds.y - outer.y) * sy >= -tolerance &&
    (bounds.x + bounds.width - outer.x) * sx <= source.width + tolerance &&
    (bounds.y + bounds.height - outer.y) * sy <= source.height + tolerance
  );
}

/** Auto and manual text are source-aligned masks; manual images are drawing primitives. */
function isContentSimplifyMask(object: DrawingSimplifyObject): boolean {
  return object.settings.automatic || object.settings.manualKind === 'text';
}

/** Returns the scene-space mask polygon used by display and final flattening. */
export function getContentSimplifyMaskCorners(object: DrawingSimplifyObject) {
  const b = object.bounds;
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((point) => transformDrawingObjectPoint(object, point));
}

/** Covers an Auto mask on source pixel edges; manual tiles retain their local bounds. */
export function getContentSimplifyRasterBounds(object: DrawingSimplifyObject): DrawingBounds {
  if (!object.settings.automatic) return object.bounds;
  const bounds = getDrawingObjectSelectionBounds(object);
  const left = bounds.x,
    top = bounds.y,
    right = bounds.x + bounds.width,
    bottom = bounds.y + bounds.height;
  const source = object.source;
  if (!source) return { x: left, y: top, width: right - left, height: bottom - top };
  const sx = source.width / source.bounds.width,
    sy = source.height / source.bounds.height;
  // A 1e-7 source-pixel tolerance excludes floating-point drift at an exact pixel edge.
  const x = source.bounds.x + Math.floor((left - source.bounds.x) * sx + 1e-7) / sx;
  const y = source.bounds.y + Math.floor((top - source.bounds.y) * sy + 1e-7) / sy;
  return {
    x,
    y,
    width: source.bounds.x + Math.ceil((right - source.bounds.x) * sx - 1e-7) / sx - x,
    height: source.bounds.y + Math.ceil((bottom - source.bounds.y) * sy - 1e-7) / sy - y,
  };
}

/** Limits the canonical handle trajectory to retained pixels, including crossed anchors. */
export function constrainDrawingSimplifyResize(
  original: DrawingObject,
  resize: (fraction: number) => DrawingObject
): DrawingObject {
  const target = resize(1);
  if (
    original.kind !== 'simplify' ||
    target.kind !== 'simplify' ||
    !original.source ||
    !isContentSimplifyMask(original)
  )
    return target;
  const source = original.source;
  const covered = (object: DrawingObject) =>
    object.kind === 'simplify' && contains(source, getContentSimplifyRasterBounds(object));
  if (!covered(original)) return original;
  if (covered(target)) return target;
  let low = 0,
    high = 1,
    accepted: DrawingObject = original;
  // Reuse the gesture's geometry instead of interpolating normalized bounds across a flip.
  for (let step = 0; step < 40; step++) {
    const fraction = (low + high) / 2,
      candidate = resize(fraction);
    if (covered(candidate)) {
      low = fraction;
      accepted = candidate;
    } else high = fraction;
  }
  return accepted;
}

async function createManualImagePlane(
  object: DrawingSimplifyObject,
  source: DrawingSimplifySource | null
): Promise<DrawingSimplifySource> {
  const scale = source
    ? Math.max(source.width / source.bounds.width, source.height / source.bounds.height)
    : window.devicePixelRatio || 1;
  const width = Math.max(1, Math.ceil(object.bounds.width * scale));
  const height = Math.max(1, Math.ceil(object.bounds.height * scale));
  if (width * height > 16_777_216) throw new Error('Simplify region exceeds the raster budget.');
  const plane = document.createElement('canvas');
  plane.width = width;
  plane.height = height;
  const context = plane.getContext('2d');
  if (!context || !object.result) throw new Error('Simplify primitive fill is unavailable.');
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Simplify primitive fill could not be decoded.'));
    image.src = object.result!.dataUrl;
  });
  context.drawImage(image, 0, 0, 1, 1, 0, 0, width, height);
  return { dataUrl: plane.toDataURL('image/png'), width, height, bounds: object.bounds };
}

interface SimplifyObjectPreparationPorts {
  acquire?: () => Promise<DrawingSimplifySource>;
  render: ReturnType<typeof createSimplifyComputeClient>['render'];
  decode(dataUrl: string): Promise<void>;
  current(): boolean;
}

async function prepareContentSimplifyObject(
  object: DrawingSimplifyObject,
  source: DrawingSimplifySource | null,
  ports: SimplifyObjectPreparationPorts
): Promise<DrawingSimplifyObject | null> {
  let retainedSource = source;
  const requested = getContentSimplifyRasterBounds(object);
  if (
    !isContentSimplifyMask(object) &&
    object.result &&
    (!source || !contains(source, requested))
  ) {
    source = await createManualImagePlane(object, source);
    if (!ports.current()) return null;
  } else if (!source || (ports.acquire && !contains(source, requested))) {
    if (!ports.acquire) return null;
    source = await ports.acquire();
    if (!ports.current()) return null;
    retainedSource = source;
  }
  if (!source) {
    return null;
  }
  const withSource = retainedSource ? { ...object, source: retainedSource } : object;
  const bounds = getContentSimplifyRasterBounds(withSource);
  // Existing masks never recapture their own accepted pixels.
  if (!contains(source, bounds)) {
    return null;
  }
  const sx = source.width / source.bounds.width,
    sy = source.height / source.bounds.height;
  const x = Math.max(0, Math.round((bounds.x - source.bounds.x) * sx));
  const y = Math.max(0, Math.round((bounds.y - source.bounds.y) * sy));
  const right = Math.min(
    source.width,
    Math.round((bounds.x + bounds.width - source.bounds.x) * sx)
  );
  const bottom = Math.min(
    source.height,
    Math.round((bounds.y + bounds.height - source.bounds.y) * sy)
  );
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const result = await ports.render({
    source,
    region: {
      x,
      y,
      width,
      height,
      ...(!object.settings.automatic && object.settings.manualKind === 'text' && object.rotation
        ? { rotation: object.rotation }
        : {}),
    },
    settings: object.settings,
  });
  if (!ports.current()) return null;
  await ports.decode(result.dataUrl);
  if (!ports.current()) return null;
  return {
    ...withSource,
    sourceDirty: false,
    engineVersion: result.version,
    result: { dataUrl: result.dataUrl, width: result.width, height: result.height },
  };
}

/** Checks the minimum supported scene-space region before source work starts. */
export function isSimplifyRegionTooSmall(object: DrawingObject): boolean {
  return object.kind === 'simplify' && (object.bounds.width < 3 || object.bounds.height < 3);
}

function canReuseManualImage(
  object: DrawingSimplifyObject,
  baseline: DrawingObject | undefined,
  force: boolean,
  append: boolean
): boolean {
  return (
    !force &&
    !isContentSimplifyMask(object) &&
    (append ||
      (baseline?.kind === 'simplify' &&
        object.settings === baseline.settings &&
        object.bounds.width === baseline.bounds.width &&
        object.bounds.height === baseline.bounds.height))
  );
}

/** Prepares every changed raster in order without mutating drawing history. */
export async function prepareDrawingSimplifySelection(
  request: {
    objects: readonly DrawingObject[];
    baselines: ReadonlyMap<string, DrawingObject>;
    force: boolean;
    append: boolean;
  },
  sourceFor: (object: DrawingSimplifyObject) => DrawingSimplifySource | null,
  ports: SimplifyObjectPreparationPorts
): Promise<DrawingObject[] | null> {
  const accepted: DrawingObject[] = [];
  // One caller keeps one worker source session and renders a mixed selection in order.
  for (const object of request.objects) {
    if (!ports.current()) return null;
    const baseline = request.baselines.get(object.id);
    if (
      object.kind !== 'simplify' ||
      canReuseManualImage(object, baseline, request.force, request.append)
    ) {
      accepted.push(object);
      continue;
    }
    const prepared = await prepareContentSimplifyObject(object, sourceFor(object), ports);
    if (!ports.current() || !prepared) return null;
    accepted.push(prepared);
  }
  return accepted;
}
