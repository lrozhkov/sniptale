import type { EditorLayerTransformationId } from '../registry';
import {
  commitLayerMutation,
  ensureRasterObject,
  getEditableObject,
  syncSourceFromObject,
  type LayerMutationContext,
} from '../mutation-shared';

export async function applyEditorLayerTransformation(
  context: LayerMutationContext & {
    id: string;
    transformationId: EditorLayerTransformationId;
  }
): Promise<void> {
  const object = getEditableObject(context.canvas, context.id);
  if (!context.canvas || !object) {
    return;
  }

  const mutationToken = context.createLayerMutationToken();
  const target =
    context.transformationId === 'resize-layer'
      ? await ensureRasterObject(context, object, mutationToken)
      : object;
  if (!target || !context.isLayerMutationTokenCurrent(mutationToken)) {
    return;
  }

  switch (context.transformationId) {
    case 'flip-horizontal':
      target.set({ flipX: !target.flipX });
      break;
    case 'flip-vertical':
      target.set({ flipY: !target.flipY });
      break;
    case 'rotate-left':
      target.rotate((target.angle ?? 0) - 90);
      break;
    case 'rotate-right':
      target.rotate((target.angle ?? 0) + 90);
      break;
    case 'resize-layer':
      return;
  }

  target.setCoords();
  syncSourceFromObject(context, target);
  commitLayerMutation(context, context.canvas);
}
