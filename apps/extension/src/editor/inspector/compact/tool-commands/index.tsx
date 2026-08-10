import type { ImageEditorController } from '../../../controller';
import type { CompactCommand } from '..';
import type { EditorInspectorCompactCommandContext } from '../command-types';
import { buildImageCompactCommands } from './image';
import { prependToolTemplateCommand } from './template';
import { buildRichShapeCompactCommands } from './rich-shape';
import {
  buildCropCompactCommands,
  buildStepCompactCommands,
} from '../../tools/tool-inspector/session-sections';

type CompactCommandController = Pick<ImageEditorController, 'applyCropSelection'>;

function isImageStyleSelection(
  type: EditorInspectorCompactCommandContext['selection']['selectedObjectType']
) {
  return type === 'image' || type === 'source-image' || type === 'background';
}

export function buildToolCompactCommands(
  params: EditorInspectorCompactCommandContext,
  controller: CompactCommandController
): CompactCommand[] {
  if (params.inspector !== 'tool') return [];
  if (params.selection.selectedObjectType === 'rich-shape') {
    return buildRichShapeCompactCommands(params);
  }
  if (isImageStyleSelection(params.selection.selectedObjectType)) {
    return buildImageCompactCommands(params);
  }
  if (params.highlightedTool === 'step') {
    return prependToolTemplateCommand(params, buildStepCompactCommands(params));
  }
  if (params.highlightedTool === 'crop') {
    return buildCropCompactCommands(params, controller);
  }
  return [];
}
