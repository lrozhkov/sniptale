import {
  commitLayerMutation,
  ensureRasterObject,
  getEditableObject,
} from '../../layer-effects/mutation-shared';
import { isEditorRasterObject } from '../../layer-effects/filters';
import { applyEditorLayerTransformation } from '../../layer-effects/raster-mutations/transform';
import type { EditorLayerTransformationId } from '../../layer-effects/registry';
import {
  createControllerLayerMutationContext,
  type LayerRasterMutationContextController,
} from './context';

export async function applyEditorControllerLayerTransformation(
  controller: LayerRasterMutationContextController,
  id: string,
  transformationId: EditorLayerTransformationId
): Promise<void> {
  await applyEditorLayerTransformation({
    ...createControllerLayerMutationContext(controller),
    id,
    transformationId,
  });
}

/** Convert the active row target without applying an effect. Keep the original on refusal. */
export async function rasterizeEditorControllerLayer(
  controller: LayerRasterMutationContextController,
  id: string
): Promise<boolean> {
  const context = createControllerLayerMutationContext(controller),
    canvas = context.canvas;
  const object = getEditableObject(canvas, id);
  if (!canvas || !object) return false;
  const active = () => {
    const selected = canvas.getActiveObjects();
    return selected.length === 1 && selected[0] === object;
  };
  if (!active()) return false;
  if (isEditorRasterObject(object)) return true;
  const token = context.createLayerMutationToken();
  const index = canvas.getObjects().indexOf(object);
  if (index < 0) return false;
  const signature = JSON.stringify(object.toObject()),
    name = object.sniptaleLabel;
  const current = () =>
    context.isLayerMutationTokenCurrent(token) &&
    canvas.getObjects().indexOf(object) === index &&
    !object.sniptaleLocked &&
    active() &&
    object.sniptaleLabel === name &&
    JSON.stringify(object.toObject()) === signature;
  const target = await ensureRasterObject(
    { ...context, isLayerMutationTokenCurrent: current },
    object,
    token
  );
  if (
    !target ||
    !context.isLayerMutationTokenCurrent(token) ||
    !canvas.getObjects().includes(target) ||
    target.sniptaleLocked ||
    canvas.getActiveObject() !== target
  )
    return false;
  commitLayerMutation(context, canvas);
  return true;
}
