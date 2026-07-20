import type { ImageEditorController } from '../../../controller';
import type { CompactCommand } from '..';
import type { EditorInspectorCompactCommandContext } from '../command-types';
import { buildBrushCompactCommands, buildShapeCompactCommands } from './style';
import { buildArrowCompactCommands } from './arrow';
import { buildBlurCompactCommands } from './blur';
import { buildLineCompactCommands } from './line';
import { buildImageCompactCommands } from './image';
import { prependToolTemplateCommand } from './template';
import {
  buildRasterBrushCompactCommands,
  buildRasterEraserCompactCommands,
  buildRasterFillCompactCommands,
  buildRasterSelectionCompactCommands,
} from './raster';
import { buildRichShapeCompactCommands } from './rich-shape';
import { buildTextCompactCommands } from '../../tools/text-sections/commands';
import {
  buildCropCompactCommands,
  buildStepCompactCommands,
} from '../../tools/tool-inspector/session-sections';

type RasterCompactCommandController = Pick<ImageEditorController, 'applyCropSelection'> & {
  clearRasterSelection?: () => void;
};

function isImageStyleSelection(
  type: EditorInspectorCompactCommandContext['selection']['selectedObjectType']
) {
  return type === 'image' || type === 'source-image' || type === 'background';
}

export function buildToolCompactCommands(
  params: EditorInspectorCompactCommandContext,
  controller: RasterCompactCommandController
): CompactCommand[] {
  if (params.inspector !== 'tool') {
    return [];
  }

  const rasterCommands = buildRasterToolCompactCommands(params.highlightedTool, controller);
  if (rasterCommands) {
    return rasterCommands;
  }

  return buildSelectedToolCompactCommands(params, controller);
}

function buildRasterToolCompactCommands(
  highlightedTool: EditorInspectorCompactCommandContext['highlightedTool'],
  controller: RasterCompactCommandController
): CompactCommand[] | null {
  if (highlightedTool === 'selection') {
    return buildRasterSelectionCompactCommands(controller);
  }
  if (highlightedTool === 'brush') {
    return buildRasterBrushCompactCommands(controller);
  }
  if (highlightedTool === 'eraser') {
    return buildRasterEraserCompactCommands(controller);
  }
  if (highlightedTool === 'fill') {
    return buildRasterFillCompactCommands(controller);
  }
  return null;
}

function buildSelectedToolCompactCommands(
  params: EditorInspectorCompactCommandContext,
  controller: RasterCompactCommandController
): CompactCommand[] {
  if (params.selection.selectedObjectType === 'rich-shape') {
    return buildRichShapeCompactCommands(params);
  }

  if (isImageStyleSelection(params.selection.selectedObjectType)) {
    return buildImageCompactCommands(params);
  }

  return buildHighlightedToolCompactCommands(params, controller);
}

function buildHighlightedToolCompactCommands(
  params: EditorInspectorCompactCommandContext,
  controller: RasterCompactCommandController
): CompactCommand[] {
  switch (params.highlightedTool) {
    case 'select':
    case 'selection':
    case 'brush':
    case 'eraser':
    case 'fill':
    case 'image':
    case 'shapes-and-lines':
    case 'rough-shape':
    case 'shape-library':
    case 'callout':
      return [];
    case 'pencil':
    case 'highlighter':
      return prependToolTemplateCommand(
        params,
        buildBrushCompactCommands(params, params.highlightedTool)
      );
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return prependToolTemplateCommand(params, buildShapeCompactCommands(params));
    case 'blur':
      return prependToolTemplateCommand(params, buildBlurCompactCommands(params));
    case 'arrow':
      return prependToolTemplateCommand(params, buildArrowCompactCommands(params));
    case 'line':
      return prependToolTemplateCommand(params, buildLineCompactCommands(params));
    case 'text':
      return prependToolTemplateCommand(params, buildTextCompactCommands(params));
    case 'step':
      return prependToolTemplateCommand(params, buildStepCompactCommands(params));
    case 'crop':
      return buildCropCompactCommands(params, controller);
  }

  return [];
}
