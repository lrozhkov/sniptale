import { describe, expect, it, vi } from 'vitest';

const useEditorStoreMock = vi.hoisted(() => vi.fn());

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T>(selector: T) => selector,
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: useEditorStoreMock,
}));

import { useEditorToolbarState } from './use-state';

describe('editor-toolbar.use-state', () => {
  it('selects the layer-effects category together with toolbar state', () => {
    const state = {
      activeTool: 'select',
      history: { canRedo: false, canUndo: true },
      inspector: 'layer-effects',
      inspectorCollapsed: false,
      layerEffectsCategory: 'filters',
      saveErrorMessage: null,
      saveState: 'idle',
      selection: { hasSelection: false, selectedObjectCount: 0 },
      setActiveTool: vi.fn(),
      setInspector: vi.fn(),
      setInspectorCollapsed: vi.fn(),
      setViewportPreviewOpenFromUser: vi.fn(),
      viewport: { zoomPercent: 150 },
      viewportPreviewOpen: false,
      workspace: { gridEnabled: true, magnetEnabled: false },
    };

    useEditorStoreMock.mockImplementation((selector: (value: typeof state) => unknown) =>
      selector(state)
    );

    expect(useEditorToolbarState()).toEqual(
      expect.objectContaining({
        activeTool: 'select',
        gridEnabled: true,
        inspector: 'layer-effects',
        layerEffectsCategory: 'filters',
        zoomPercent: 150,
      })
    );
  });
});
