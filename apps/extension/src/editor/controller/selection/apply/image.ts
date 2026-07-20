import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { applyImageSettings, isImageLayerStyleObject } from '../../../objects/image-style';

export function applyImageLayerSettings(
  objects: FabricObject[],
  imageSettings: EditorToolSettings['image']
): void {
  objects.forEach((object) => {
    if (isImageLayerStyleObject(object)) {
      applyImageSettings(object, imageSettings);
    }
  });
}
