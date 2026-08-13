import type { EditorTool } from '../../../features/editor/document/types';
import type { ImageEditorController } from '../../controller';
import type { ToolbarInspector } from './types';

export function closeLayerEffectsBeforeToolbarAction(args: {
  inspector: ToolbarInspector | 'tool';
  setActiveTool: (tool: EditorTool) => void;
}) {
  if (args.inspector !== 'layer-effects') {
    return;
  }

  args.setActiveTool('select');
}

type ToolbarActionArgs = {
  controller: Pick<
    ImageEditorController,
    'cancelCropMode' | 'clearSelection' | 'setActiveTool' | 'suspendToolMode'
  >;
  hasImage: boolean;
  inspector: ToolbarInspector | 'tool';
  setActiveTool: (tool: EditorTool) => void;
  setInspector: (inspector: ToolbarInspector | 'tool') => void;
};

function prepareToolAction(
  args: ToolbarActionArgs,
  options?: { preserveCropMode?: boolean; preserveSelection?: boolean }
) {
  if (!args.hasImage) {
    return false;
  }

  closeLayerEffectsBeforeToolbarAction(args);
  if (args.inspector === 'canvas-size' && !options?.preserveCropMode) {
    args.controller.cancelCropMode();
  }
  if (!options?.preserveSelection) {
    args.controller.clearSelection();
  }
  return true;
}

function activateSelectInspector(
  args: ToolbarActionArgs,
  nextInspector: ToolbarInspector | 'tool'
) {
  args.setActiveTool('select');
  args.controller.setActiveTool('select');
  args.setInspector(nextInspector);
}

function toggleResizeInspector(
  args: ToolbarActionArgs,
  nextInspector: Extract<ToolbarInspector, 'canvas-size' | 'image-size'>
) {
  if (args.inspector === nextInspector) {
    args.controller.cancelCropMode();
    args.setActiveTool('select');
    args.setInspector('tool');
    return;
  }

  if (args.inspector === 'canvas-size' || args.inspector === 'image-size') {
    args.controller.cancelCropMode();
  }

  const nextTool = nextInspector === 'canvas-size' ? 'crop' : 'select';
  args.setActiveTool(nextTool);
  args.controller.setActiveTool(nextTool);
  args.setInspector(nextInspector);
}

function toggleFileInspector(args: ToolbarActionArgs) {
  const closingFile = args.inspector === 'file';
  args.setActiveTool('select');
  if (closingFile) {
    args.controller.setActiveTool('select');
    args.setInspector('tool');
    return;
  }

  args.controller.suspendToolMode();
  args.setInspector('file');
}

export function createEditorToolbarActions(args: ToolbarActionArgs) {
  return {
    activateTool(tool: EditorTool) {
      if (!prepareToolAction(args)) {
        return;
      }

      args.setInspector('tool');
      args.setActiveTool(tool);
      args.controller.setActiveTool(tool);
    },

    toggleInspector(value: ToolbarInspector) {
      const resizeInspector = value === 'canvas-size' || value === 'image-size';
      if (!prepareToolAction(args, { preserveCropMode: resizeInspector })) {
        return;
      }

      if (value === 'file') {
        toggleFileInspector(args);
        return;
      }

      if (resizeInspector) {
        toggleResizeInspector(args, value);
        return;
      }

      activateSelectInspector(args, args.inspector === value ? 'tool' : value);
    },
  };
}
