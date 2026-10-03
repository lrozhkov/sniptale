import { getDrawingSelectionBounds, type DrawingObject } from '../../features/drawing/public';
import type { PageScrollRoot } from '../platform/page-scroll';
import type { PointerDraft } from './interaction';
import { getDrawingViewportProjection } from './interaction';
import {
  renderDrawingMarquee,
  renderDrawingMultiSelection,
  renderDrawingObject,
  renderDrawingSelection,
} from './render';
import { resolveDrawingFrameRenderables } from './frame-renderables';

export function drawDrawingFrame(args: {
  canvas: HTMLCanvasElement;
  objects: readonly DrawingObject[];
  draft: PointerDraft | null;
  selectedIds: readonly string[];
  root: PageScrollRoot;
  showChrome: boolean;
  renderObjects?: boolean;
  suppressText?: boolean;
  getObjectOpacity?: (objectId: string) => number;
}): void {
  const {
    canvas,
    objects,
    draft,
    selectedIds,
    root,
    showChrome,
    renderObjects = true,
    suppressText = false,
  } = args;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const cssWidth = `${width}px`;
  const cssHeight = `${height}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const projection = getDrawingViewportProjection(root);
  context.save();
  if (root.kind === 'element') {
    const rect = root.element.getBoundingClientRect();
    context.beginPath();
    context.rect(rect.left, rect.top, rect.width, rect.height);
    context.clip();
  }
  if (renderObjects) {
    resolveDrawingFrameRenderables(objects, draft).forEach(({ object }) => {
      if (!suppressText || object.kind !== 'text')
        renderDrawingObject(context, object, projection, {
          opacity: args.getObjectOpacity?.(object.id) ?? 1,
        });
    });
  }
  if (showChrome && draft?.kind === 'marquee') {
    renderDrawingMarquee(context, draft.start, draft.current, projection);
  }
  if (showChrome && selectedIds.length > 0) {
    const selected = resolveDrawingFrameRenderables(objects, draft)
      .map(({ object }) => object)
      .filter((object) => selectedIds.includes(object.id));
    if (selected.length === 1) renderDrawingSelection(context, selected[0]!, projection);
    else renderDrawingMultiSelection(context, selected, projection);
  }
  context.restore();
}

type DrawingSnapshotSource = {
  objects: readonly DrawingObject[];
  root: PageScrollRoot;
  getObjectOpacity?: (objectId: string) => number;
};

// Disposable render bindings; the drawing session remains the document authority.
const snapshotSources = new WeakMap<HTMLCanvasElement, () => DrawingSnapshotSource>();

export function registerDrawingSnapshotSource(
  canvas: HTMLCanvasElement,
  source: () => DrawingSnapshotSource
): () => void {
  snapshotSources.set(canvas, source);
  return () => {
    if (snapshotSources.get(canvas) === source) snapshotSources.delete(canvas);
  };
}

/** Render committed ink across the scene, including content outside the current viewport. */
export function captureDrawingFrame(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const source = snapshotSources.get(canvas)?.();
  if (!source) return null;
  const objects = source.objects.filter(
    (object) => object.kind !== 'text' && object.kind !== 'blur'
  );
  const snapshot = canvas.ownerDocument.createElement('canvas');
  const bounds = getDrawingSelectionBounds(objects);
  if (!bounds) {
    snapshot.width = 1;
    snapshot.height = 1;
    snapshot.style.display = 'none';
    return snapshot;
  }
  const padding = Math.max(2, ...objects.map((object) => ('width' in object ? object.width : 0)));
  const left = Math.floor(bounds.x - padding);
  const top = Math.floor(bounds.y - padding);
  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  const projection = getDrawingViewportProjection(source.root);
  // Bound allocation for long pages while preserving all ink and its CSS geometry.
  const ratio = Math.min(
    Math.max(1, canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1),
    8192 / width,
    8192 / height,
    Math.sqrt(16_777_216 / (width * height))
  );
  snapshot.width = Math.max(1, Math.floor(width * ratio));
  snapshot.height = Math.max(1, Math.floor(height * ratio));
  Object.assign(snapshot.style, {
    position: 'fixed',
    left: `${left - projection.x}px`,
    top: `${top - projection.y}px`,
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  });
  if (source.root.kind === 'element') {
    const clip = source.root.element.getBoundingClientRect();
    const x = left - projection.x;
    const y = top - projection.y;
    snapshot.style.clipPath = `inset(${Math.max(0, clip.top - y)}px ${Math.max(0, x + width - clip.right)}px ${Math.max(0, y + height - clip.bottom)}px ${Math.max(0, clip.left - x)}px)`;
  }
  const context = snapshot.getContext('2d');
  if (!context) throw new Error('Drawing snapshot canvas is unavailable');
  context.setTransform(snapshot.width / width, 0, 0, snapshot.height / height, 0, 0);
  for (const object of objects) {
    renderDrawingObject(
      context,
      object,
      { x: left, y: top },
      {
        opacity: source.getObjectOpacity?.(object.id) ?? 1,
      }
    );
  }
  return snapshot;
}
