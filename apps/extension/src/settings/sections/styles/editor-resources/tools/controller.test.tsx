// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => vi.fn());
vi.mock('../storage', () => ({ useEditorPresetStorageState: storage }));
vi.mock('./actions', () => ({ createToolPresetActions: () => ({ deletePreset: vi.fn() }) }));
import { useToolPresetsController } from './controller';
it('selects the active tool collection from the shared storage snapshot', () => {
  storage.mockReturnValue({ pencil: { defaultPresetId: 'a', presets: [{ id: 'a' }] } });
  let latest: ReturnType<typeof useToolPresetsController> | undefined;
  function Harness() {
    latest = useToolPresetsController();
    return null;
  }
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<Harness />));
  expect(latest?.collection.presets).toEqual([{ id: 'a' }]);
  expect(latest?.collection.defaultPresetId).toBe('a');
  act(() => root.unmount());
});
