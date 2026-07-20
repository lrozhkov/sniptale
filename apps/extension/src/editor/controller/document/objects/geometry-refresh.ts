import type { FabricObject } from 'fabric';
import { getArrowSettings, isArrowObject, updateArrowObject } from '../../../objects/arrow';
import { isBlurObject, updateBlurObject } from '../../../objects/annotation/blur/object';
import { getLineSettings, isLineObject, updateLineObject } from '../../../objects/line';

export function refreshPreparedObjectGeometry(
  object: FabricObject,
  arrowSettings: ReturnType<typeof getArrowSettings> | null
): void {
  if (isArrowObject(object)) {
    updateArrowObject(object, { settings: arrowSettings ?? getArrowSettings(object) });
  }

  if (isLineObject(object)) {
    updateLineObject(object, { settings: getLineSettings(object) });
  }

  if (isBlurObject(object)) {
    updateBlurObject(object);
  }
}
