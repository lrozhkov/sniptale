import { ActiveSelection, type Canvas, type FabricObject } from 'fabric';

type RasterizedEditorRenderData = {
  bounds: ReturnType<FabricObject['getBoundingRect']>;
  dataUrl: string;
};

function getObjectRenderData(object: FabricObject): RasterizedEditorRenderData {
  const bounds = object.getBoundingRect();

  return {
    bounds,
    dataUrl: object.toDataURL({ format: 'png' }),
  };
}

function getSelectionRenderData(
  canvas: Canvas,
  objects: FabricObject[]
): RasterizedEditorRenderData {
  const selection = new ActiveSelection(objects, { canvas });
  selection.setCoords();
  const bounds = selection.getBoundingRect();

  return {
    bounds,
    dataUrl: selection.toDataURL({ format: 'png' }),
  };
}

export function rasterizeEditorObjects(
  canvas: Canvas,
  objects: FabricObject[]
): RasterizedEditorRenderData | null {
  const [singleObject] = objects;
  if (objects.length === 0) {
    return null;
  }

  return objects.length === 1 && singleObject
    ? getObjectRenderData(singleObject)
    : getSelectionRenderData(canvas, objects);
}
