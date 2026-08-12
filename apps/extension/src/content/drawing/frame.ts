import type { DrawingObject } from '../../features/drawing/public';
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
  suppressText?: boolean;
  getObjectOpacity?: (objectId: string) => number;
}): void {
  const { canvas, objects, draft, selectedIds, root, showChrome, suppressText = false } = args;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const cssWidth = `${width}px`;
  const cssHeight = `${height}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
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
  resolveDrawingFrameRenderables(objects, draft).forEach(({ object, preview }) => {
    if (!suppressText || object.kind !== 'text')
      renderDrawingObject(context, object, projection, {
        opacity: args.getObjectOpacity?.(object.id) ?? 1,
        ...(preview ? { preview: true } : {}),
      });
  });
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
