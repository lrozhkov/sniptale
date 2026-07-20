import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { applyFreehandSettingsToObject } from '../../freehand';

export function applyBrushSettings(
  objects: FabricObject[],
  settings: EditorToolSettings['pencil']
): void {
  objects.forEach((object) => {
    applyFreehandSettingsToObject(object, settings);
  });
}
