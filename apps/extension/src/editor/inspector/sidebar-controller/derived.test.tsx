// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   derived-state proof intentionally keeps measurement and palette branches together */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAspectRatio: vi.fn((width: number, height: number) => (height === 0 ? null : width / height)),
  getEditorToolbarDerivedState: vi.fn(() => ({ highlightedTool: 'select' })),
  getFramePaddingSummary: vi.fn(() => '24 / 24 / 24 / 24'),
}));

vi.mock('../sidebar-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sidebar-shared')>()),
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

it('derives selection-aware measurements and resizable layer state', () => {
  const getValue = renderHook({
    activeTool: 'select',
    canvasHeight: 600,
    canvasWidth: 900,
    frameDraft: {
      backgroundColor: '#ffffff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#111111',
      backgroundGradientStops: ['#111111', '#555555', '#222222'],
      backgroundGradientTo: '#222222',
      backgroundMode: 'gradient',
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
      selectedObjectType: 'image',
      selectedObjectWidth: 240,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()).toEqual(
    expect.objectContaining({
      backgroundModeLabel: 'gradient',
      backgroundSummary: '#111111 → #555555 → #222222',
      canDeleteSelection: true,
      highlightedTool: 'select',
      imageSizeText: '400 × 300',
      isResizableLayerSelection: true,
      layerSizeText: '240 × 120',
      showDocumentActions: false,
      showViewportMetrics: true,
    })
  );
});

it('falls back to workspace/background summaries for non-resizable multi-selection', () => {
  const getValue = renderHook({
    activeTool: 'pencil',
    canvasHeight: 600,
    canvasWidth: 900,
    frameDraft: {
      backgroundColor: '#abcdef',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#111111',
      backgroundGradientTo: '#222222',
      backgroundImageData: 'data:image/png;base64,abc',
      backgroundImageFit: 'fit-width',
      backgroundMode: 'image',
      layoutMode: 'shadow',
    } as never,
    hasImage: false,
    inspector: 'file',
    selection: {
      hasSelection: true,
      selectedObjectCount: 2,
      selectedObjectHeight: null,
      selectedObjectId: null,
      selectedObjectIds: ['a', 'b'],
      selectedObjectType: null,
      selectedObjectWidth: null,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 0,
    sourceWidth: 0,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()).toEqual(
    expect.objectContaining({
      backgroundSummary: 'image',
      backgroundPreviewStyle: expect.objectContaining({
        backgroundImage: 'url("data:image/png;base64,abc")',
        backgroundSize: '100% auto',
      }),
      inspectorToolSettings: { id: 'tool-settings' },
      isResizableLayerSelection: false,
      layerSizeText: '0 × 0',
      showDocumentActions: true,
      showViewportMetrics: false,
    })
  );
});

it('prefers selection settings when the selected layer matches the active tool family', () => {
  const getValue = renderHook({
    activeTool: 'ellipse',
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
      selectedObjectHeight: 80,
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
      selectedObjectType: 'ellipse',
      selectedObjectWidth: 120,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()).toEqual(
    expect.objectContaining({
      inspectorToolSettings: { id: 'selection-settings' },
    })
  );
});

it('falls back to active tool settings when the selection type is not compatible with the current tool', () => {
  const getValue = renderHook({
    activeTool: 'arrow',
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
      selectedObjectHeight: 80,
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
      selectedObjectType: 'rectangle',
      selectedObjectWidth: 120,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()).toEqual(
    expect.objectContaining({
      inspectorToolSettings: { id: 'tool-settings' },
    })
  );
});

it('prefers provided editor preset palettes over storage defaults', () => {
  const getValue = renderHook({
    activeTool: 'text',
    canvasHeight: 600,
    canvasWidth: 900,
    editorPresetState: {
      pencil: { defaultPresetId: 'pencil', presets: [] },
      highlighter: { defaultPresetId: 'highlighter', presets: [] },
      ellipse: { defaultPresetId: 'ellipse', presets: [] },
      arrow: { defaultPresetId: 'arrow', presets: [] },
      text: { defaultPresetId: 'text', presets: [] },
      step: { defaultPresetId: 'step', presets: [] },
      sceneBackground: { defaultPresetId: 'scene', presets: [] },
      palette: {
        sceneBackground: ['#111111'],
        shapeFill: ['#222222'],
        shapeStroke: ['#333333'],
        textBackground: ['#444444'],
        textColor: ['#555555'],
      },
    } as never,
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
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectHeight: null,
      selectedObjectId: null,
      selectedObjectIds: [],
      selectedObjectType: null,
      selectedObjectWidth: null,
    },
    selectionToolSettings: { id: 'selection-settings' } as never,
    sourceHeight: 300,
    sourceWidth: 400,
    toolSettings: { id: 'tool-settings' } as never,
  });

  expect(getValue()).toEqual(
    expect.objectContaining({
      frameBackgroundPalette: ['#111111'],
      shapeFillPalette: ['#222222'],
      shapeStrokePalette: ['#333333'],
      textBackgroundPalette: ['#444444'],
      textColorPalette: ['#555555'],
    })
  );
});
