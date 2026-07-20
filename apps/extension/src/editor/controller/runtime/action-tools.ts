import type { Canvas } from 'fabric';
import type { EditorTool } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import { applyEditorToolMode } from '../tools/tool-mode/application';
import { advanceEditorStepValue } from '../tools/tool-mode/step-value';

export function applyEditorControllerToolMode(options: {
  canvas: Canvas | null;
  activeTool: EditorTool;
  enabled: boolean;
  hasCropGuide: boolean;
  clearCropSelection: () => void;
}): void {
  applyEditorToolMode({
    canvas: options.canvas,
    activeTool: options.activeTool,
    enabled: options.enabled,
    hasCropGuide: options.hasCropGuide,
    clearCropSelection: options.clearCropSelection,
  });
}

export function switchEditorControllerToSelectTool(options: {
  setActiveTool: (tool: 'select') => void;
  applyToolMode: () => void;
}): void {
  options.setActiveTool('select');
  useEditorStore.getState().setActiveTool('select');
  options.applyToolMode();
}

export function advanceEditorControllerStepValue(): void {
  advanceEditorStepValue();
}
