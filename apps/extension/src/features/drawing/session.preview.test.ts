import { expect, it, vi } from 'vitest';
import { createDrawingSession, type DrawingDocumentCommit } from './session';

it('previews color without history, restores on cancel, and commits the final color once', () => {
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  const original = {
    id: 'shape',
    kind: 'rectangle' as const,
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    color: '#111111',
    fillColor: null,
    width: 2,
  };
  session.commitObject(original);
  onDocumentCommit.mockClear();

  session.previewObjects([{ ...original, color: '#222222' }]);
  session.previewObjects([{ ...original, color: '#333333' }]);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ color: '#333333' });
  expect(onDocumentCommit).not.toHaveBeenCalled();

  session.clearObjectPreview();
  expect(session.getSnapshot().document.objects[0]).toBe(original);
  session.previewObjects([{ ...original, color: '#444444' }]);
  session.replaceObject({ ...original, color: '#444444' });
  expect(onDocumentCommit).toHaveBeenCalledOnce();
  expect(onDocumentCommit.mock.calls[0]?.[0].before.objects[0]).toBe(original);
  expect(onDocumentCommit.mock.calls[0]?.[0].after.objects[0]).toMatchObject({
    color: '#444444',
  });
});

it('removes a temporary preview when a document commit is rejected', () => {
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  const original = {
    id: 'line',
    kind: 'pencil' as const,
    samples: [{ x: 0, y: 0, t: 0 }],
    color: '#111111',
    width: 4,
  };
  session.commitObject(original);
  onDocumentCommit.mockReturnValue(false);
  session.previewObjects([{ ...original, color: '#222222' }]);
  session.replaceObject({ ...original, color: '#222222' });
  expect(session.getSnapshot().document.objects[0]).toBe(original);
});

it('clears a preview on same-document replay and a thrown commit', () => {
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  const original = {
    id: 'line',
    kind: 'pencil' as const,
    samples: [{ x: 0, y: 0, t: 0 }],
    color: '#111111',
    width: 4,
  };
  session.commitObject(original);
  const firstCommit = onDocumentCommit.mock.calls[0]![0];
  expect(firstCommit.replay(firstCommit.after)).toBe(true);
  session.previewObjects([{ ...original, color: '#222222' }]);
  expect(firstCommit.replay(firstCommit.after)).toBe(true);
  expect(session.getSnapshot().document.objects[0]).toBe(original);

  session.previewObjects([{ ...original, color: '#333333' }]);
  onDocumentCommit.mockImplementation(() => {
    throw new Error('History unavailable');
  });
  expect(() => session.replaceObject({ ...original, color: '#333333' })).toThrow(
    'History unavailable'
  );
  expect(session.getSnapshot().document.objects[0]).toBe(original);
});

it('restores the committed object when history throws without a preview', () => {
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  const original = {
    id: 'line',
    kind: 'pencil' as const,
    samples: [{ x: 0, y: 0, t: 0 }],
    color: '#111111',
    width: 4,
  };
  session.commitObject(original);
  onDocumentCommit.mockImplementation(() => {
    throw new Error('History unavailable');
  });
  expect(() => session.replaceObject({ ...original, color: '#222222' })).toThrow(
    'History unavailable'
  );
  expect(session.getSnapshot().document.objects[0]).toBe(original);
});

it('drops a temporary color when history replays an earlier document', () => {
  const onDocumentCommit = vi.fn<(commit: DrawingDocumentCommit) => boolean>(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  const original = {
    id: 'line',
    kind: 'pencil' as const,
    samples: [{ x: 0, y: 0, t: 0 }],
    color: '#111111',
    width: 4,
  };
  session.commitObject(original);
  session.replaceObject({ ...original, color: '#222222' });
  const lastCommit = onDocumentCommit.mock.calls[1]![0];
  session.previewObjects([{ ...original, color: '#333333' }]);
  expect(lastCommit.replay(lastCommit.before)).toBe(true);
  expect(session.getSnapshot().document.objects[0]).toBe(original);
});

it('ignores previews without matching replacements and after disposal', () => {
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const original = {
    id: 'line',
    kind: 'pencil' as const,
    samples: [{ x: 0, y: 0, t: 0 }],
    color: '#111111',
    width: 4,
  };
  session.commitObject(original);
  const revision = session.getSnapshot().revision;
  session.previewObjects([]);
  session.previewObjects([{ ...original, id: 'missing' }]);
  session.clearObjectPreview();
  expect(session.getSnapshot().revision).toBe(revision);
  session.previewObjects([{ ...original, color: '#222222' }]);
  session.setActiveTool('select');
  expect(session.getSnapshot().document.objects[0]).toBe(original);
  session.previewObjects([{ ...original, color: '#333333' }]);
  session.select(null);
  expect(session.getSnapshot().document.objects[0]).toBe(original);
  session.dispose();
  session.previewObjects([{ ...original, color: '#222222' }]);
  expect(session.getSnapshot().document.objects).toEqual([]);
});
