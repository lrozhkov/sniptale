import { expect, it, vi } from 'vitest';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { EDITOR_PALETTE_KEYS, getEditorPaletteLabel } from './families';
it('exposes every palette family with canonical labels', () => {
  expect(EDITOR_PALETTE_KEYS).toHaveLength(6);
  expect(getEditorPaletteLabel('drawing')).toBe('settings.editor.paletteDrawing');
  expect(getEditorPaletteLabel('shapeStroke')).toBe('settings.editor.paletteShapeStroke');
});
