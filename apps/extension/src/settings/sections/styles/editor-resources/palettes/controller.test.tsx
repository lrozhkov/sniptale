// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createDefaultEditorPresetStorageState } from '../../../../../composition/persistence/editor-presets/defaults';
const mocks = vi.hoisted(() => ({ rename: vi.fn(), toast: vi.fn() }));
vi.mock('../storage', () => ({
  useEditorPresetStorageState: () => createDefaultEditorPresetStorageState(),
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));
vi.mock('../../../../../composition/picker-preferences/use-palette-names', () => ({
  usePaletteNames: () => ({ '#112233': 'Named' }),
}));
vi.mock('../../../../../composition/persistence/drawing-palette', async (original) => ({
  ...(await original<typeof import('../../../../../composition/persistence/drawing-palette')>()),
  loadDrawingPaletteState: vi.fn(async () => ({ colors: ['#112233'] })),
  subscribeToDrawingPaletteState: vi.fn(() => () => undefined),
  renamePaletteColor: mocks.rename,
}));
import { usePalettesController } from './controller';
it('uses one rename command for both palettes and reports refused and failed saves', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let state!: ReturnType<typeof usePalettesController>;
  function Sample() {
    state = usePalettesController();
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Sample />));
    expect(state.names['#112233']).toBe('Named');
    mocks.rename.mockResolvedValueOnce('applied');
    expect(await state.renameColor('#112233', 'New')).toBe(true);
    act(() => state.setKey('sceneBackground'));
    expect(state.names['#112233']).toBe('Named');
    mocks.rename.mockResolvedValueOnce('rejected');
    expect(await state.renameColor('#112233', 'New')).toBe(false);
    mocks.rename.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await state.renameColor('#112233', 'New')).toBe(false);
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.rename).toHaveBeenCalledWith('#112233', 'New');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
