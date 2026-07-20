import { expect, it, vi } from 'vitest';
import { createEditorColorPatchHandlers } from './color-actions';

it('routes apply and preview colors through one patch setter', () => {
  const applyPatch = vi.fn();
  const updateColor = vi.fn((setter: (next: string) => void, color: string) => setter(color));
  const previewColor = vi.fn((setter: (next: string) => void, color: string) => setter(color));
  const handlers = createEditorColorPatchHandlers({
    applyPatch,
    createPatch: (color: string) => ({ color }),
    previewColor,
    updateColor,
  });

  handlers.onChange('#112233');
  handlers.onPreviewChange('#445566');
  handlers.onPreviewReset('#778899');

  expect(updateColor).toHaveBeenCalledWith(expect.any(Function), '#112233');
  expect(previewColor).toHaveBeenCalledTimes(2);
  expect(applyPatch).toHaveBeenNthCalledWith(1, { color: '#112233' });
  expect(applyPatch).toHaveBeenNthCalledWith(2, { color: '#445566' });
  expect(applyPatch).toHaveBeenNthCalledWith(3, { color: '#778899' });
});
