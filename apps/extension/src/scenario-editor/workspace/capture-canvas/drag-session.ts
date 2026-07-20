import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { toPointerPreviewPoint } from '../drag-preview/frame';
import type { ScenarioWorkspacePanDragState } from './helpers';
import { applyWorkspaceDragPatch } from './helpers';

export function clearCanvasDragPreview(onDragPreview: (patch: ScenarioStepPatch | null) => void) {
  onDragPreview(null);
}

export function commitCanvasDragPatch(
  dragState: ScenarioWorkspacePanDragState,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  onDragCommit: (patch: ScenarioStepPatch) => void,
  scale: number
): ScenarioStepPatch | null {
  const patch = applyWorkspaceDragPatch({
    dragState,
    event: toPointerPreviewPoint(event),
    scale,
  });
  if (patch) {
    onDragCommit(patch);
  }

  return patch;
}

export function previewCanvasDragPatch(
  dragState: ScenarioWorkspacePanDragState,
  point: ReturnType<typeof toPointerPreviewPoint>,
  onDragPreview: (patch: ScenarioStepPatch | null) => void,
  scale: number
): ScenarioStepPatch | null {
  const patch = applyWorkspaceDragPatch({
    dragState,
    event: point,
    scale,
  });
  if (patch) {
    onDragPreview(patch);
  }

  return patch;
}
