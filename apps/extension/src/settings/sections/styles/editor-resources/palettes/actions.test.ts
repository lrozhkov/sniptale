import { expect, it, vi } from 'vitest';
const save = vi.hoisted(() => vi.fn());
vi.mock('../../../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/editor-presets')
  >()),
  saveEditorPaletteSettings: save,
}));
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ toast: { error: vi.fn() } }));
import { createPaletteActions } from './actions';
it('routes palette edits through the existing persistence owner', async () => {
  const palette = {
    shapeStroke: ['#1', '#2'],
    shapeFill: [],
    textColor: [],
    textBackground: [],
    sceneBackground: [],
  };
  const actions = createPaletteActions({
    draggedIndex: 0,
    key: 'shapeStroke',
    palette,
    clearDrag: vi.fn(),
  });
  await actions.changeColor(0, '#3');
  await actions.dropColor(1);
  expect(save).toHaveBeenNthCalledWith(1, expect.objectContaining({ shapeStroke: ['#3', '#2'] }));
  expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ shapeStroke: ['#2', '#1'] }));
});
