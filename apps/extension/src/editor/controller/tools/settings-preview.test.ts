import { expect, it, vi } from 'vitest';
import { refreshEditorToolSettingsPreview } from './settings-preview';

it('requests a canvas render for shared drawing settings previews', () => {
  const canvas = { requestRenderAll: vi.fn() };

  refreshEditorToolSettingsPreview({
    activeTool: 'pencil',
    canvas: canvas as never,
    drawSession: null,
  });
  refreshEditorToolSettingsPreview({ activeTool: 'pencil', canvas: null, drawSession: null });

  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});
