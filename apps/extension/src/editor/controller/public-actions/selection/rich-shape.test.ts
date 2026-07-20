// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

const richShapeTextEditorMocks = vi.hoisted(() => ({
  refreshRichShapeTextEditorForCanvas: vi.fn(),
}));

vi.mock('../../rich-shape-text-editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../rich-shape-text-editor')>()),
  refreshRichShapeTextEditorForCanvas: richShapeTextEditorMocks.refreshRichShapeTextEditorForCanvas,
}));
import { getEditorBuiltInShapeEntry } from '../../../../features/editor/document/rich-shape';
import { createRichShapeCatalogObject } from '../../../objects/rich-shape';
import {
  getSelectedRichShapeDocumentObject,
  updateSelectedRichShapeFormatting,
} from './rich-shape';

function createSelectedRichShapeCanvas() {
  const entry = getEditorBuiltInShapeEntry('rectangle');
  if (!entry) {
    throw new Error('Missing rectangle entry');
  }
  const object = createRichShapeCatalogObject({
    entry,
    id: 'shape-1',
    labelIndex: 1,
    left: 10,
    top: 20,
  });
  const canvas = {
    getActiveObjects: () => [object],
    requestRenderAll: vi.fn(),
  };

  return { canvas, object };
}

it('updates document state, Fabric object projection, and runtime history symmetrically', () => {
  const { canvas, object } = createSelectedRichShapeCanvas();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();
  const withHistoryMuted = vi.fn((callback: () => unknown) => callback()) as unknown as <T>(
    callback: () => T
  ) => T;

  expect(
    updateSelectedRichShapeFormatting(
      {
        canvas: canvas as never,
        commitHistory,
        syncRuntimeState,
        withHistoryMuted,
      },
      {
        effects: { reflection: { enabled: true, opacity: 0.4, distance: 8, size: 0.45 } },
        frame: { height: 140, left: 32, top: 44, width: 220 },
        style: { fill: { type: 'solid', color: '#ff0000' }, fillTransparency: 0.2 },
        text: { content: 'Office shape' },
      }
    )
  ).toBe(true);

  expect(object.left).toBe(32);
  expect(object.width).toBe(220);
  expect(object.sniptaleRichShape.text.content).toBe('Office shape');
  expect(object.sniptaleRichShape.effects.reflection.enabled).toBe(true);
  expect(getSelectedRichShapeDocumentObject({ canvas: canvas as never })).toEqual(
    expect.objectContaining({
      frame: expect.objectContaining({ height: 140, left: 32, top: 44, width: 220 }),
      style: expect.objectContaining({ fillTransparency: 0.2 }),
    })
  );
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
  expect(richShapeTextEditorMocks.refreshRichShapeTextEditorForCanvas).toHaveBeenCalledWith(canvas);
});

it('ignores empty and ambiguous rich-shape selections without committing history', () => {
  const { canvas, object } = createSelectedRichShapeCanvas();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();
  const withHistoryMuted = vi.fn((callback: () => unknown) => callback()) as unknown as <T>(
    callback: () => T
  ) => T;
  const emptyCanvas = { getActiveObjects: () => [], requestRenderAll: vi.fn() };
  const multiCanvas = { getActiveObjects: () => [object, object], requestRenderAll: vi.fn() };

  expect(
    updateSelectedRichShapeFormatting(
      {
        canvas: emptyCanvas as never,
        commitHistory,
        syncRuntimeState,
        withHistoryMuted,
      },
      { rotation: 30 }
    )
  ).toBe(false);
  expect(getSelectedRichShapeDocumentObject({ canvas: multiCanvas as never })).toBeNull();
  expect(updateSelectedRichShapeFormatting({} as never, { rotation: 30 })).toBe(false);

  expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  expect(commitHistory).not.toHaveBeenCalled();
  expect(syncRuntimeState).not.toHaveBeenCalled();
});

it('does not update locked rich-shape selections', () => {
  const { canvas, object } = createSelectedRichShapeCanvas();
  object.sniptaleLocked = true;
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();
  const withHistoryMuted = vi.fn((callback: () => unknown) => callback()) as unknown as <T>(
    callback: () => T
  ) => T;

  expect(
    updateSelectedRichShapeFormatting(
      {
        canvas: canvas as never,
        commitHistory,
        syncRuntimeState,
        withHistoryMuted,
      },
      { rotation: 30 }
    )
  ).toBe(false);

  expect(withHistoryMuted).not.toHaveBeenCalled();
  expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  expect(commitHistory).not.toHaveBeenCalled();
  expect(syncRuntimeState).not.toHaveBeenCalled();
});
