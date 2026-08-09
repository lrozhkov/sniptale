import type { DrawingObject } from '../../features/drawing/public';
import type { PageScrollRoot } from '../platform/page-scroll';
import type { PointerDraft } from './interaction';
import { getDrawingViewportProjection } from './interaction';
import { renderDrawingObject, renderDrawingSelection } from './render';

export function drawDrawingFrame(args: {
  canvas: HTMLCanvasElement;
  objects: readonly DrawingObject[];
  draft: PointerDraft | null;
  selectedId: string | null;
  root: PageScrollRoot;
  showChrome: boolean;
}): void {
  const { canvas, objects, draft, selectedId, root, showChrome } = args;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
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
  objects.forEach((object) => renderDrawingObject(context, object, projection));
  if (draft?.kind === 'create') renderDrawingObject(context, draft.object, projection);
  if (showChrome && selectedId) {
    const selected =
      draft && draft.kind !== 'create' && draft.object.id === selectedId
        ? draft.object
        : objects.find((object) => object.id === selectedId);
    if (selected) renderDrawingSelection(context, selected, projection);
  }
  context.restore();
}
