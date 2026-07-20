import {
  commitLayerMutation,
  syncSourceFromObject,
  type LayerMutationContext,
} from '../mutation-shared';
import { resolveRasterizedMutationTarget } from './target';

export async function resizeEditorLayerWithRasterize(
  context: LayerMutationContext & {
    id: string;
    width: number;
    height: number;
  }
): Promise<void> {
  const resolved = await resolveRasterizedMutationTarget(context);
  if (!resolved) {
    return;
  }

  const currentWidth = resolved.target.getScaledWidth();
  const currentHeight = resolved.target.getScaledHeight();
  if (currentWidth <= 0 || currentHeight <= 0) {
    return;
  }

  const nextWidth = Math.max(1, Math.round(context.width));
  const nextHeight = Math.max(1, Math.round(context.height));
  resolved.target.set({
    scaleX: (resolved.target.scaleX ?? 1) * (nextWidth / currentWidth),
    scaleY: (resolved.target.scaleY ?? 1) * (nextHeight / currentHeight),
  });
  resolved.target.setCoords();
  syncSourceFromObject(context, resolved.target);
  commitLayerMutation(context, resolved.canvas);
}
