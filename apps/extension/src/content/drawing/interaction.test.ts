import { afterEach, expect, it, vi } from 'vitest';
import {
  createDefaultDrawingToolDefaults,
  createDrawingSession,
  type DrawingShapeKind,
} from '../../features/drawing/public';
import {
  beginDrawingPointer,
  commitDrawingPointerDraft,
  updateCreatedDrawingObject,
} from './interaction';

afterEach(() => vi.restoreAllMocks());

it.each<DrawingShapeKind>(['rectangle', 'ellipse', 'triangle', 'parallelogram'])(
  'creates and commits the selected %s shape through the unified shape tool',
  (kind) => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000000'
    );
    const session = createDrawingSession({ onDocumentCommit: () => true });
    const defaults = createDefaultDrawingToolDefaults(['#ef4444']);
    session.setDefaults({ ...defaults, shape: { color: '#ef4444', kind, width: 4 } });
    session.setActiveTool('shape');
    const started = beginDrawingPointer({
      point: { x: 10, y: 20 },
      snapshot: session.getSnapshot(),
      timestamp: 0,
    });
    expect(started.draft?.object.kind).toBe(kind);
    if (!started.draft || started.draft.kind !== 'create') throw new Error('Expected shape draft');
    const object = updateCreatedDrawingObject({
      object: started.draft.object,
      point: { x: 70, y: 60 },
      square: false,
      start: started.draft.start,
      timestamp: 10,
    });
    commitDrawingPointerDraft(session, { ...started.draft, object });
    expect(session.getSnapshot().document.objects[0]).toMatchObject({
      bounds: { x: 10, y: 20, width: 60, height: 40 },
      kind,
    });
    expect(session.getSnapshot().selectedObjectId).toBe(
      'drawing-00000000-0000-4000-8000-000000000000'
    );
  }
);

it.each(['pencil', 'marker'] as const)('commits a new %s stroke without selecting it', (tool) => {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.setActiveTool(tool);
  const started = beginDrawingPointer({
    point: { x: 10, y: 20 },
    snapshot: session.getSnapshot(),
    timestamp: 0,
  });
  if (!started.draft || started.draft.kind !== 'create') throw new Error('Expected stroke draft');
  const object = updateCreatedDrawingObject({
    object: started.draft.object,
    point: { x: 70, y: 60 },
    square: false,
    start: started.draft.start,
    timestamp: 10,
  });

  commitDrawingPointerDraft(session, { ...started.draft, object });

  expect(session.getSnapshot().document.objects[0]?.kind).toBe(tool);
  expect(session.getSnapshot().selectedObjectId).toBeNull();
});
