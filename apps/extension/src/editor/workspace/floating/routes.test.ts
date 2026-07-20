import { expect, it } from 'vitest';
import type { EditorTool } from '../../../features/editor/document/types';
import type { EditorInspector } from '../../state/types';
import {
  isCanvasSelectionToolbarEligible,
  isLeftDrawerMode,
  isRightUtilityMode,
  resolveFloatingSurfaceRoute,
} from './routes';

const rightUtilities: EditorInspector[] = [
  'frame',
  'browser-frame',
  'meta',
  'workspace',
  'grid',
  'canvas-size',
  'image-size',
  'layer-effects',
];

it('routes library and independent tool modes into the left drawer', () => {
  const leftTools: EditorTool[] = ['shapes-and-lines', 'rough-shape', 'shape-library'];

  expect(leftTools.every(isLeftDrawerMode)).toBe(true);
  expect(isLeftDrawerMode('pencil')).toBe(false);
  expect(isLeftDrawerMode('step')).toBe(false);

  for (const activeTool of leftTools) {
    expect(
      resolveFloatingSurfaceRoute({
        activeTool,
        hasImage: true,
        inspector: 'tool',
        selection: { hasSelection: false },
      }).leftDrawer
    ).toBe(activeTool);
  }
});

it('routes document and scene utilities into a compact right panel', () => {
  for (const inspector of rightUtilities) {
    expect(isRightUtilityMode(inspector)).toBe(true);
    expect(
      resolveFloatingSurfaceRoute({
        activeTool: 'select',
        hasImage: true,
        inspector,
        selection: { hasSelection: false },
      }).rightUtility
    ).toBe(inspector);
  }

  expect(isRightUtilityMode('file')).toBe(false);
  expect(isRightUtilityMode('tool')).toBe(false);
});

it('keeps the selection toolbar on canvas only for editable selection states', () => {
  expect(
    isCanvasSelectionToolbarEligible({
      activeTool: 'select',
      hasImage: true,
      inspector: 'tool',
      selection: { hasSelection: true },
    })
  ).toBe(true);
  expect(
    isCanvasSelectionToolbarEligible({
      activeTool: 'brush',
      hasImage: true,
      inspector: 'tool',
      selection: { hasSelection: true },
    })
  ).toBe(false);
  expect(
    isCanvasSelectionToolbarEligible({
      activeTool: 'crop',
      hasImage: true,
      inspector: 'tool',
      selection: { hasSelection: true },
    })
  ).toBe(false);
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'step',
      hasImage: true,
      inspector: 'tool',
      selection: { hasSelection: true },
    }).canvasSelectionToolbar
  ).toBe(true);
  expect(
    resolveFloatingSurfaceRoute({
      activeTool: 'shape-library',
      hasImage: true,
      inspector: 'tool',
      selection: { hasSelection: true },
    })
  ).toEqual({
    canvasSelectionToolbar: true,
    leftDrawer: 'shape-library',
    rightUtility: null,
  });
});
