import {
  ensureRasterObject,
  getEditableObject,
  type LayerMutationContext,
} from '../mutation-shared';

export async function resolveRasterizedMutationTarget(
  context: LayerMutationContext & { id: string }
) {
  const object = getEditableObject(context.canvas, context.id);
  if (!context.canvas || !object) {
    return null;
  }

  const mutationToken = context.createLayerMutationToken();
  const target = await ensureRasterObject(context, object, mutationToken);
  if (!target || !context.isLayerMutationTokenCurrent(mutationToken)) {
    return null;
  }

  return {
    canvas: context.canvas,
    target,
  };
}
