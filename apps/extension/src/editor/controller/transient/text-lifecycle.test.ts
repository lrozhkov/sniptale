import { beforeEach, expect, it, vi } from 'vitest';

const applyTextLayoutMock = vi.hoisted(() => vi.fn());

vi.mock('../../objects/annotation/text/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/layout')>()),
  applyTextLayout: applyTextLayoutMock,
}));

import { completeEditorDrawSession } from './';

beforeEach(() => {
  applyTextLayoutMock.mockClear();
});

it('uses shared canvas lifecycle click-vs-drag decisions for text layout mode', () => {
  const clickText = { type: 'textbox' };
  const dragText = { type: 'textbox' };

  completeEditorDrawSession({
    canvasDocumentSize: { height: 200, width: 300 },
    drawSession: {
      lastPoint: { x: 36, y: 10 },
      object: clickText,
      start: { x: 10, y: 10 },
      tool: 'text',
    } as never,
    minDrawSize: 8,
  });
  completeEditorDrawSession({
    canvasDocumentSize: { height: 200, width: 300 },
    drawSession: {
      lastPoint: { x: 36, y: 32 },
      object: dragText,
      start: { x: 10, y: 10 },
      tool: 'text',
    } as never,
    minDrawSize: 8,
  });

  expect(applyTextLayoutMock).toHaveBeenNthCalledWith(1, clickText, {
    layoutMode: 'auto',
  });
  expect(applyTextLayoutMock).toHaveBeenNthCalledWith(2, dragText, {
    layoutMode: 'fixed-width',
  });
});

it('falls back to completed object geometry for legacy text draw sessions without lifecycle points', () => {
  const text = {
    getBoundingRect: () => ({ height: 40, width: 40 }),
    type: 'textbox',
  };

  completeEditorDrawSession({
    canvasDocumentSize: { height: 200, width: 300 },
    drawSession: {
      object: text,
      tool: 'text',
    } as never,
    minDrawSize: 8,
  });

  expect(applyTextLayoutMock).toHaveBeenCalledWith(text, {
    layoutMode: 'fixed-width',
  });
});
