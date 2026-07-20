// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAspectRatio: vi.fn((width: number, height: number) => (height === 0 ? null : width / height)),
  getEditorToolbarDerivedState: vi.fn(() => ({ highlightedTool: 'select' })),
  getFramePaddingSummary: vi.fn(() => '24 / 24 / 24 / 24'),
}));

vi.mock('../sidebar-shared', () => ({
  getAspectRatio: mocks.getAspectRatio,
  getFramePaddingSummary: mocks.getFramePaddingSummary,
}));

vi.mock('../toolbar-derived-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../toolbar-derived-state')>()),
  getEditorToolbarDerivedState: mocks.getEditorToolbarDerivedState,
}));

import { useEditorInspectorSidebarDerived } from './derived';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHook(args: Parameters<typeof useEditorInspectorSidebarDerived>[0]) {
  let value: ReturnType<typeof useEditorInspectorSidebarDerived> | null = null;
  const Harness = () => {
    value = useEditorInspectorSidebarDerived(args);
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return () => value;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('keeps the source-image layer out of the resizable-layer inspector branch', () => {
  const getValue = renderHook({
    activeTool: 'select',
    canvasHeight: 600,
    canvasWidth: 900,
    frameDraft: {
      backgroundColor: '#abcdef',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#111111',
      backgroundGradientTo: '#222222',
      backgroundMode: 'color',
      layoutMode: 'shadow',
    } as never,
    hasImage: true,
    inspector: 'tool',
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectHeight: 120,
      selectedObjectId: 'source-layer',
      selectedObjectIds: ['source-layer'],
      selectedObjectType: 'source-image',
      selectedObjectWidth: 240,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()).toEqual(
    expect.objectContaining({
      isResizableLayerSelection: false,
      layerSizeText: '240 × 120',
    })
  );
});
