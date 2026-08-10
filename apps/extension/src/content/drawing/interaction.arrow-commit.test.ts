import { expect, it } from 'vitest';
import { createDrawingSession, type DrawingArrowObject } from '../../features/drawing/public';
import { commitDrawingPointerDraft, type PointerDraft } from './interaction';

function createArrowDraft(length: number, width: number): PointerDraft {
  const object: DrawingArrowObject = {
    color: '#ef4444',
    dynamicWidth: true,
    end: { x: length, y: 0 },
    id: `arrow-${length}-${width}`,
    kind: 'arrow',
    start: { x: 0, y: 0 },
    width,
  };
  return { kind: 'create', object, start: object.start };
}

it.each([
  { expected: 0, length: 0, width: 8 },
  { expected: 0, length: 15, width: 8 },
  { expected: 1, length: 16, width: 8 },
  { expected: 0, length: 47, width: 24 },
  { expected: 1, length: 48, width: 24 },
])(
  'commits $width px arrows only when their $length px gesture is visually meaningful',
  ({ expected, length, width }) => {
    const session = createDrawingSession({ onDocumentCommit: () => true });

    commitDrawingPointerDraft(session, createArrowDraft(length, width));

    expect(session.getSnapshot().document.objects).toHaveLength(expected);
  }
);
