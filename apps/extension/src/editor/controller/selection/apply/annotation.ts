import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { isGroup } from '../../core/helpers';
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
