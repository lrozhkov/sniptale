import { expect, it, vi } from 'vitest';

const useEditorStoreMock = vi.hoisted(() => vi.fn());

vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector: unknown) => selector,
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: useEditorStoreMock,
}));

import { useEditorInspectorStoreSlice } from './store';

it('selects image setting updaters for the inspector sidebar seam', () => {
  const updateImageSettings = vi.fn();
  const updateSelectionImageSettings = vi.fn();
  const state = new Proxy(
    { updateImageSettings, updateSelectionImageSettings },
    {
      get: (target, key: string) => (key in target ? target[key as keyof typeof target] : key),
    }
  );
  useEditorStoreMock.mockImplementation((selector) => selector(state));

  const slice = useEditorInspectorStoreSlice();

  expect(slice.updateImageSettings).toBe(updateImageSettings);
  expect(slice.updateSelectionImageSettings).toBe(updateSelectionImageSettings);
});
