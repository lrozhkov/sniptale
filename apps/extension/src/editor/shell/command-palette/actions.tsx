import { Copy, Download, Expand, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  EditorHistoryState,
  EditorSelectionState,
  EditorTool,
} from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import {
  commandPaletteIcon,
  createCommandPaletteRunAction,
  createCommandPaletteToolAction,
} from '../../../ui/command-palette/action-builders';
import { TOOL_ICONS, TOOL_ORDER, getToolLabel } from '../../chrome/tool-icons';
import type { ImageEditorController } from '../../controller';
import { exportEditorSession, saveEditorRenderedImage } from '../../document/file-actions';
import type { EditorState } from '../../state/types';

interface BuildEditorCommandPaletteActionsArgs {
  hasImage: boolean;
  controller: Pick<
    ImageEditorController,
    | 'copyRenderedImage'
    | 'exportDocument'
    | 'deleteSelection'
    | 'duplicateSelection'
    | 'redo'
    | 'renderToDataUrl'
    | 'resetZoom'
    | 'setActiveTool'
    | 'undo'
    | 'zoomIn'
    | 'zoomOut'
    | 'zoomToFit'
  >;
  activeTool: EditorTool;
  history: EditorHistoryState;
  selection: EditorSelectionState;
  setActiveTool: (tool: EditorTool) => void;
  setInspector: EditorState['setInspector'];
  setImageData: (imageData: string | null) => void;
}

function activateEditorTool(
  tool: EditorTool,
  setActiveTool: (tool: EditorTool) => void,
  setInspector: EditorState['setInspector'],
  controller: Pick<ImageEditorController, 'setActiveTool'>
) {
  setInspector('tool');
  setActiveTool(tool);
  controller.setActiveTool(tool);
}

function buildEditorToolActions(
  args: BuildEditorCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return TOOL_ORDER.map((tool) =>
    createCommandPaletteToolAction({
      id: `editor-tool-${tool}`,
      title: getToolLabel(tool),
      section: translate('shared.ui.commandPaletteToolsSection'),
      icon: TOOL_ICONS[tool],
      disabled: !args.hasImage,
      active: args.activeTool === tool,
      onSelect: () =>
        activateEditorTool(tool, args.setActiveTool, args.setInspector, args.controller),
    })
  );
}

function buildEditorHistoryActions(
  args: BuildEditorCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'editor-undo',
      title: translate('editor.toolbar.undo'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Undo2),
      disabled: !args.hasImage || !args.history.canUndo,
      onSelect: () => args.controller.undo(),
    }),
    createCommandPaletteRunAction({
      id: 'editor-redo',
      title: translate('editor.toolbar.redo'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Redo2),
      disabled: !args.hasImage || !args.history.canRedo,
      onSelect: () => args.controller.redo(),
    }),
  ];
}

function buildEditorDocumentActions(
  args: BuildEditorCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'editor-save-png',
      title: translate('editor.toolbar.savePng'),
      section: translate('editor.documentActions.fileSection'),
      icon: commandPaletteIcon(Download),
      disabled: !args.hasImage,
      onSelect: () => saveEditorRenderedImage(args.controller),
    }),
    createCommandPaletteRunAction({
      id: 'editor-copy-png',
      title: translate('editor.toolbar.copyPng'),
      section: translate('editor.documentActions.fileSection'),
      icon: commandPaletteIcon(Copy),
      disabled: !args.hasImage,
      onSelect: () => args.controller.copyRenderedImage(),
    }),
    createCommandPaletteRunAction({
      id: 'editor-export-session',
      title: translate('editor.toolbar.exportSession'),
      section: translate('editor.documentActions.fileSection'),
      icon: commandPaletteIcon(Download),
      disabled: !args.hasImage,
      onSelect: () => exportEditorSession(args.controller),
    }),
  ];
}

function buildEditorSelectionActions(
  args: BuildEditorCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'editor-duplicate-selection',
      title: translate('editor.toolbar.duplicateSelection'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Copy),
      disabled: !args.selection.hasSelection,
      onSelect: () => args.controller.duplicateSelection(),
    }),
    createCommandPaletteRunAction({
      id: 'editor-delete-selection',
      title: translate('editor.toolbar.deleteSelection'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Trash2),
      disabled: !args.selection.hasSelection,
      onSelect: () => args.controller.deleteSelection(),
    }),
  ];
}

function buildEditorWorkspaceActions(
  args: BuildEditorCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'editor-zoom-in',
      title: translate('editor.toolbar.zoomIn'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(ZoomIn),
      disabled: !args.hasImage,
      onSelect: () => args.controller.zoomIn(),
    }),
    createCommandPaletteRunAction({
      id: 'editor-zoom-out',
      title: translate('editor.toolbar.zoomOut'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(ZoomOut),
      disabled: !args.hasImage,
      onSelect: () => args.controller.zoomOut(),
    }),
    createCommandPaletteRunAction({
      id: 'editor-fit-to-window',
      title: translate('editor.toolbar.fitToWindow'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(Expand),
      disabled: !args.hasImage,
      onSelect: () => args.controller.zoomToFit(),
    }),
    createCommandPaletteRunAction({
      id: 'editor-reset-zoom',
      title: translate('editor.toolbar.resetZoomPrefix'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(Expand),
      disabled: !args.hasImage,
      onSelect: () => args.controller.resetZoom(),
    }),
  ];
}

export function buildEditorCommandPaletteActions(
  args: BuildEditorCommandPaletteActionsArgs
): CommandPaletteAction[] {
  return [
    ...buildEditorToolActions(args),
    ...buildEditorHistoryActions(args),
    ...buildEditorDocumentActions(args),
    ...buildEditorSelectionActions(args),
    ...buildEditorWorkspaceActions(args),
  ];
}
