import type { FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import { syncRichShapeSelectionSettings } from '../rich-shape-sync';
import { syncImageSelectionSettings } from '../sync-image';
import { syncArrowSelectionSettings, syncLineSelectionSettings } from '../sync-linear';
import { syncStepSelectionSettings } from '../sync-step';
import { syncTextSelectionSettings } from '../sync-text/dispatch';
import { syncBlurSelectionSettings } from './blur';
import { syncBrushSelectionSettings } from './brush';
import { syncShapeSelectionSettings } from './shape';

export function syncSelectionToolSettingsFromObject(
  object: FabricObject,
  type: EditorObjectType
): void {
  switch (type) {
    case 'transparent-base':
    case 'browser-frame':
      break;
    case 'source-image':
    case 'background':
    case 'image':
      syncImageSelectionSettings(object);
      break;
    case 'pencil':
    case 'highlighter':
      syncBrushSelectionSettings(object, type);
      break;
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      syncShapeSelectionSettings(object, type);
      break;
    case 'blur':
      syncBlurSelectionSettings(object);
      break;
    case 'text':
    case 'meta-stamp':
      syncTextSelectionSettings(object);
      break;
    case 'step':
      syncStepSelectionSettings(object);
      break;
    case 'arrow':
      syncArrowSelectionSettings(object);
      break;
    case 'line':
      syncLineSelectionSettings(object);
      break;
    case 'rich-shape':
      syncRichShapeSelectionSettings(object);
      break;
  }
}
