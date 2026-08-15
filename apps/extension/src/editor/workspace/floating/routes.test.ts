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
  ).toEqual({ leftDrawer: null });
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'select',
      hasImage: true,
      inspector: 'workspace',
      selection: emptySelection,
    })
  ).toEqual({ leftDrawer: null });
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'select',
      hasImage: true,
      inspector: 'tool',
      selection: { ...emptySelection, hasSelection: true, selectedObjectCount: 2 },
    })
  ).toEqual({ leftDrawer: null });
});

it('keeps the suspended drawer closed across editor interaction states', () => {
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
      activeTool: 'shape',
      hasImage: false,
      inspector: 'tool',
      selection: emptySelection,
    })
  ).toEqual({ leftDrawer: null });
});

it('does not add a canvas toolbar route for drawing selections', () => {
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
      })
    ).toEqual({ leftDrawer: null });
  }
});
