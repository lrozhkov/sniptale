import type { ImageEditorController } from '../../../controller';
import type { CompactCommand } from '..';
import type { EditorInspectorCompactCommandContext } from '../command-types';
import {
  buildCanvasSizeCompactCommands,
  buildFileCompactCommands,
  buildImageSizeCompactCommands,
} from './document-sections';
import { buildBrowserFrameCompactCommands, buildFrameCompactCommands } from './frame-sections';
import { buildLayerEffectsCompactCommands } from './layer-effects';
import {
  buildGridCompactCommands,
  buildMetaCompactCommands,
  buildSelectionActionCommands,
  buildWorkspaceCompactCommands,
} from './workspace-sections';
import { buildToolCompactCommands } from '../tool-commands';

export function buildInspectorCompactCommands(
  params: EditorInspectorCompactCommandContext,
  controller: Pick<
    ImageEditorController,
    'applyCropSelection' | 'deleteSelection' | 'duplicateSelection' | 'insertTechnicalData'
  >
): CompactCommand[] {
  if (!params.hasImage && params.inspector !== 'tool') {
    return [];
  }

  if (params.inspector === 'file') {
    return buildFileCompactCommands(params);
  }
  if (params.inspector === 'image-size') {
    return buildImageSizeCompactCommands(params);
  }
  if (params.inspector === 'canvas-size') {
    return buildCanvasSizeCompactCommands(params);
  }
  if (params.inspector === 'layer-effects') {
    return buildLayerEffectsCompactCommands(params);
  }
  if (params.inspector === 'frame') {
    return buildFrameCompactCommands(params);
  }
  if (params.inspector === 'browser-frame') {
    return buildBrowserFrameCompactCommands(params);
  }
  if (params.inspector === 'workspace') {
    return buildWorkspaceCompactCommands(params);
  }
  if (params.inspector === 'grid') {
    return buildGridCompactCommands(params);
  }
  if (params.inspector === 'meta') {
    return buildMetaCompactCommands(controller);
  }

  return buildToolCompactCommands(params, controller);
}

export { buildSelectionActionCommands };
