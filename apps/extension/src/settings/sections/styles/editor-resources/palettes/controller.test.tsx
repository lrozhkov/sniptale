// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => vi.fn());
vi.mock('../storage', () => ({ useEditorPresetStorageState: storage }));
vi.mock('./actions', () => ({ createPaletteActions: () => ({ changeColor: vi.fn() }) }));
import { usePalettesController } from './controller';
it('selects the active palette from the shared storage snapshot', () => {
  storage.mockReturnValue({
    palette: {
      shapeStroke: ['#123'],
      shapeFill: [],
      textColor: [],
      textBackground: [],
      sceneBackground: [],
    },
  });
  let latest: ReturnType<typeof usePalettesController> | undefined;
  function Harness() {
    latest = usePalettesController();
    return null;
  }
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<Harness />));
  expect(latest?.colors).toEqual(['#123']);
  act(() => root.unmount());
});
