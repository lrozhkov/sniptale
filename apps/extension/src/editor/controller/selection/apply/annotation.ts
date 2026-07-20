import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { isGroup } from '../../core/helpers';
import { isBlurObject } from '../../../objects/annotation/blur/object/identity';
import { updateBlurObject } from '../../../objects/annotation/blur/object/update';
import { updateStepGroup } from '../../../objects/annotation';

export function applyStepSettings(
  objects: FabricObject[],
  stepSettings: EditorToolSettings['step']
): void {
  objects.forEach((object) => {
    if (!isGroup(object)) {
      return;
    }

    updateStepGroup(object, stepSettings);
  });
}

export function applyBlurSettings(
  objects: FabricObject[],
  blurSettings: EditorToolSettings['blur']
): void {
  objects.forEach((object) => {
    if (!isBlurObject(object)) {
      return;
    }

    updateBlurObject(object, { settings: blurSettings });
  });
}
