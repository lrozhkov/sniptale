import { expect, it } from 'vitest';
import { resolveFloatingSurfaceRoute } from './routes';

const emptySelection = {
  hasSelection: false,
  selectedObjectCount: 0,
  selectedObjectType: null,
};

it('keeps the suspended shape catalog closed while routing utility inspectors and selections', () => {
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'shape',
      hasImage: true,
      inspector: 'tool',
      selection: emptySelection,
    })
  ).toEqual({ canvasSelectionToolbar: false, leftDrawer: null, rightUtility: null });
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'select',
      hasImage: true,
      inspector: 'workspace',
      selection: emptySelection,
    })
  ).toEqual({ canvasSelectionToolbar: false, leftDrawer: null, rightUtility: 'workspace' });
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'select',
      hasImage: true,
      inspector: 'tool',
      selection: { ...emptySelection, hasSelection: true, selectedObjectCount: 2 },
    })
  ).toEqual({ canvasSelectionToolbar: true, leftDrawer: null, rightUtility: null });
});

it('suppresses drawers and selection toolbar for dismissed, empty, crop, and frame annotation states', () => {
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'shape',
      dismissedLeftDrawerTool: 'shape',
      hasImage: true,
      inspector: 'tool',
      selection: emptySelection,
    }).leftDrawer
  ).toBeNull();
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'crop',
      hasImage: true,
      inspector: 'tool',
      selection: { ...emptySelection, hasSelection: true },
    }).canvasSelectionToolbar
  ).toBe(false);
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'select',
      hasImage: true,
      inspector: 'tool',
      selection: {
        ...emptySelection,
        hasSelection: true,
        selectedObjectCount: 1,
        selectedObjectType: 'frame-annotation',
      },
    }).canvasSelectionToolbar
  ).toBe(false);
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'shape',
      hasImage: false,
      inspector: 'tool',
      selection: emptySelection,
    })
  ).toEqual({ canvasSelectionToolbar: false, leftDrawer: null, rightUtility: null });
});

it('keeps the generic lock toolbar away from single and multi drawing selections', () => {
  for (const selection of [
    {
      ...emptySelection,
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectType: 'shape',
      selectedObjectsAreDrawing: true,
    },
    {
      ...emptySelection,
      hasSelection: true,
      selectedObjectCount: 3,
      selectedObjectType: null,
      selectedObjectsAreDrawing: true,
    },
  ]) {
    expect(
      resolveFloatingSurfaceRoute({
        activeTool: 'select',
        hasImage: true,
        inspector: 'tool',
        selection,
      }).canvasSelectionToolbar
    ).toBe(false);
  }
});
