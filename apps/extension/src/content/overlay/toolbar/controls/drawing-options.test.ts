import { expect, it } from 'vitest';
import { createDrawingSession } from '../../../../features/drawing/public';
import { resolveDrawingQuickOptionsTool } from './drawing-options';

it('routes selected text through the shared text options owner', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.commitObject({
    backgroundColor: null,
    bounds: { height: 34, width: 120, x: 10, y: 20 },
    color: '#111827',
    fontFamily: 'handwritten',
    fontSize: 24,
    id: 'text-1',
    kind: 'text',
    text: 'Shared text',
  });
  session.setActiveTool('select');

  expect(resolveDrawingQuickOptionsTool(session.getSnapshot())).toBe('text');
});
