// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../sidebar-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sidebar-shared')>()),
  getAspectRatio: vi.fn(() => 2),
  getFramePaddingSummary: vi.fn(() => '24 / 24 / 24 / 24'),
}));

vi.mock('../toolbar-derived-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../toolbar-derived-state')>()),
  getEditorToolbarDerivedState: vi.fn(() => ({ highlightedTool: 'select' })),
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

it('does not expose locked image selections as resizable layer selections', () => {
  const getValue = renderHook({
    activeTool: 'select',
    canvasHeight: 600,
    canvasWidth: 900,
    frameDraft: {
      backgroundColor: '#ffffff',
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
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
      selectedObjectLocked: true,
      selectedObjectType: 'image',
      selectedObjectWidth: 240,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()?.isResizableLayerSelection).toBe(false);
});
