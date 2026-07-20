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

function isRasterToolbarTool(tool: EditorTool): tool is 'selection' | 'brush' | 'eraser' | 'fill' {
  return tool === 'selection' || tool === 'brush' || tool === 'eraser' || tool === 'fill';
}

function prepareToolAction(args: ToolbarActionArgs, options?: { preserveSelection?: boolean }) {
  if (!args.hasImage) {
    return false;
  }

  closeLayerEffectsBeforeToolbarAction(args);
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

function toggleResizeInspector(args: ToolbarActionArgs) {
  if (args.inspector === 'canvas-size' || args.inspector === 'image-size') {
    args.controller.cancelCropMode();
    args.setActiveTool('select');
    args.setInspector('tool');
    return;
  }

  args.setActiveTool('crop');
  args.controller.setActiveTool('crop');
  args.setInspector('canvas-size');
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
      if (
        !prepareToolAction(args, {
          preserveSelection: isRasterToolbarTool(tool),
        })
      ) {
        return;
      }

      args.setInspector('tool');
      args.setActiveTool(tool);
      args.controller.setActiveTool(tool);
    },

    toggleInspector(value: ToolbarInspector) {
      if (!prepareToolAction(args)) {
        return;
      }

      if (value === 'file') {
        toggleFileInspector(args);
        return;
      }

      if (value === 'canvas-size' || value === 'image-size') {
        toggleResizeInspector(args);
        return;
      }

      activateSelectInspector(args, args.inspector === value ? 'tool' : value);
    },
  };
}
