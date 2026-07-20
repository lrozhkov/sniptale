import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { isArrowObject, updateArrowObject } from '../../../objects/arrow';
import { isLineObject, updateLineObject } from '../../../objects/line';

export function applyArrowSettings(
  objects: FabricObject[],
  arrowSettings: EditorToolSettings['arrow']
): void {
  objects.forEach((object) => {
    if (!isArrowObject(object)) {
      return;
    }

    updateArrowObject(object, { settings: arrowSettings });
  });
}

export function applyLineSettings(
  objects: FabricObject[],
  lineSettings: EditorToolSettings['line']
): void {
  objects.forEach((object) => {
    if (!isLineObject(object)) {
      return;
    }

    updateLineObject(object, { settings: lineSettings });
  });
}
