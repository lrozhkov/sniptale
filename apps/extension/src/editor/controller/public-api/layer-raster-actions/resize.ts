import { resizeEditorLayerWithRasterize } from '../../layer-effects/raster-mutations/resize';
import { isEditorRasterLayerType } from '../../layer-effects/rasterize/layer-type';
import { resizeEditorLayerById } from '../../public-actions/selection/layers/source-mutations';
import {
  createControllerLayerMutationContext,
  createControllerLayerReachableSourceContext,
  type LayerRasterResizeContextController,
} from './context';

export function resizeEditorControllerLayer(
  controller: LayerRasterResizeContextController,
  id: string,
  width: number,
  height: number
): void {
  if (!shouldResizeLayerThroughRasterMutation(controller, id)) {
    resizeEditorLayerById({
      id,
      width,
      height,
      ...createControllerLayerReachableSourceContext(controller),
    });
    return;
  }

  void resizeEditorLayerWithRasterize({
    id,
    width,
    height,
    ...createControllerLayerMutationContext(controller),
  });
}

function shouldResizeLayerThroughRasterMutation(
  controller: Pick<LayerRasterResizeContextController, 'canvas'>,
  id: string
): boolean {
  const canvasObjects =
    typeof controller.canvas?.getObjects === 'function' ? controller.canvas.getObjects() : null;
  const targetType = canvasObjects?.find((object) => object.sniptaleId === id)?.sniptaleType;

  return targetType === undefined || isEditorRasterLayerType(targetType);
}
