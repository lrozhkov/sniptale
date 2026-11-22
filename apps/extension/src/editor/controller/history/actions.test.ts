// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { describeEditorHistoryAction, describeEditorHistoryObject } from './actions';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape/types';
import type { EditorHistoryAction } from '../../../features/editor-history/action';
import {
  createEditorSnapshotHistory,
  deferEditorSnapshotHistory,
  flushDeferredEditorHistory,
  pushEditorSnapshotHistory,
  readEditorHistoryEntries,
  readEditorHistoryState,
  replaceCurrentEditorSnapshotHistory,
  undoEditorSnapshot,
} from './index';

it.each([
  [{ left: 10 }, 'move'],
  [{ left: 10, sniptaleDrawingJson: 'translated canonical geometry' }, 'move'],
  [{ scaleX: 2, left: 10 }, 'resize'],
  [{ angle: 45 }, 'rotate'],
  [{ text: 'Hello' }, 'text'],
  [{ fill: '#c759ed' }, 'fill'],
  [{ visible: false }, 'visibility'],
  [{ sniptaleLocked: true }, 'lock'],
  [{ sniptaleLabel: 'Caption' }, 'rename'],
  [{ futureToolProperty: 7 }, 'update'],
] as const)(
  'describes admitted object changes without a tool-specific history call: %o',
  (patch, operation) => {
    const object = { sniptaleId: 'a', sniptaleLabel: 'Title', left: 0, top: 0, fill: '#000000' };
    const old = describeEditorHistoryObject('v1', object)!;
    const next = describeEditorHistoryObject('v2', { ...object, ...patch })!;
    const read = vi.fn((token: string) =>
      JSON.stringify(token === 'v1' ? object : { ...object, ...patch })
    );
    const action = describeEditorHistoryAction(
      { objects: [old], document: {} },
      { objects: [next], document: {} },
      read
    );
    expect(action.operation).toBe(operation);
    expect(action.target?.id).toBe('a');
    if (operation === 'fill') expect(action.color).toEqual({ before: '#000000', after: '#c759ed' });
    expect(read).toHaveBeenCalledTimes(2);
  }
);

it('does not read unchanged object versions or media for an insertion or a reorder', () => {
  const before = { objects: [{ token: 'large-image', id: 'a', name: 'Photo' }], document: {} };
  const after = {
    objects: [...before.objects, { token: 'new-tool', id: 'b', name: 'Note' }],
    document: {},
  };
  const read = vi.fn(() => {
    throw new Error('Existing payload must not be decoded');
  });
  expect(describeEditorHistoryAction(before, after, read)).toEqual({
    operation: 'add',
    target: { id: 'b', name: 'Note' },
  });
  expect(describeEditorHistoryAction(after, before, read).operation).toBe('remove');
  expect(
    describeEditorHistoryAction(after, { ...after, objects: [...after.objects].reverse() }, read)
      .operation
  ).toBe('reorder');
  expect(read).not.toHaveBeenCalled();
});

it('describes actual structured shape edits and keeps combined property changes generic', () => {
  const shape = createDefaultRichShapeObject({ id: 'card', shapeKind: 'rectangle' });
  const changes: {
    patch: Partial<EditorRichShapeDocumentObject>;
    operation: EditorHistoryAction['operation'];
  }[] = [
    { patch: { frame: { ...shape.frame, left: shape.frame.left + 10 } }, operation: 'move' },
    { patch: { frame: { ...shape.frame, width: shape.frame.width + 10 } }, operation: 'resize' },
    { patch: { rotation: 15 }, operation: 'rotate' },
    { patch: { text: { ...shape.text, content: 'Caption' } }, operation: 'text' },
    {
      patch: { layer: { ...shape.layer, visible: !shape.layer.visible } },
      operation: 'visibility',
    },
    { patch: { layer: { ...shape.layer, locked: !shape.layer.locked } }, operation: 'lock' },
    { patch: { layer: { ...shape.layer, zIndex: 2 } }, operation: 'reorder' },
    {
      patch: {
        layer: { ...shape.layer, visible: !shape.layer.visible, locked: !shape.layer.locked },
      },
      operation: 'update',
    },
    {
      patch: { style: { ...shape.style, fill: { type: 'solid', color: '#c759ed' } } },
      operation: 'fill',
    },
    {
      patch: { style: { ...shape.style, line: { ...shape.style.line, color: '#c759ed' } } },
      operation: 'stroke',
    },
    { patch: { style: { ...shape.style, opacity: 0.5 } }, operation: 'update' },
  ];
  for (const { patch, operation } of changes) {
    const base = { ...createMockDocument(), richShapes: [shape] };
    const history = createEditorSnapshotHistory(base);
    pushEditorSnapshotHistory({
      history,
      muted: false,
      exportDocument: () => ({ ...base, richShapes: [{ ...shape, ...patch }] }),
    });
    expect(readEditorHistoryEntries(history)[1]?.action?.operation, JSON.stringify(patch)).toBe(
      operation
    );
  }
});

it('keeps batch insertion, deletion and document resize labels separate from a single object', () => {
  const base = createMockDocument();
  const history = createEditorSnapshotHistory(base);
  const objects = [
    { type: 'rect', sniptaleId: 'a', sniptaleLabel: 'First' },
    { type: 'rect', sniptaleId: 'b', sniptaleLabel: 'Second' },
  ];
  pushEditorSnapshotHistory({
    history,
    muted: false,
    exportDocument: () => ({ ...base, canvasJson: JSON.stringify({ objects }) }),
  });
  expect(readEditorHistoryEntries(history).at(-1)?.action).toEqual({
    operation: 'add',
    target: null,
  });
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => base });
  expect(readEditorHistoryEntries(history).at(-1)?.action).toEqual({
    operation: 'remove',
    target: null,
  });
  pushEditorSnapshotHistory({
    history,
    muted: false,
    exportDocument: () => ({ ...base, canvasWidth: base.canvasWidth + 20 }),
  });
  expect(readEditorHistoryEntries(history).at(-1)?.action).toEqual({
    operation: 'resize',
    target: null,
  });
});

it('projects actual operations through the pooled capture boundary, retention and Undo branches', () => {
  const base = createMockDocument();
  const withObjects = (objects: unknown[]) => ({
    ...base,
    canvasJson: JSON.stringify({ objects }),
  });
  const object = { type: 'rect', sniptaleId: 'a', sniptaleLabel: 'Card', left: 0, top: 0 };
  const history = createEditorSnapshotHistory(withObjects([]), {
    maxActions: 2,
    maxBytes: 100_000,
  });
  const push = (objects: unknown[]) =>
    pushEditorSnapshotHistory({
      history,
      muted: false,
      exportDocument: () => withObjects(objects),
    });
  push([object]);
  push([{ ...object, left: 10 }]);
  expect(readEditorHistoryEntries(history).map((entry) => entry.action?.operation)).toEqual([
    undefined,
    'add',
    'move',
  ]);
  push([{ ...object, left: 20 }]);
  expect(readEditorHistoryEntries(history).map((entry) => entry.action?.operation)).toEqual([
    undefined,
    'move',
    'move',
  ]);
  undoEditorSnapshot(history);
  push([]);
  expect(readEditorHistoryEntries(history).map((entry) => entry.action?.operation)).toEqual([
    undefined,
    'move',
    'remove',
  ]);
});

it('keeps the user action label when a derived result replaces the current snapshot', () => {
  const base = createMockDocument();
  const history = createEditorSnapshotHistory(base);
  const document = { ...base, displayName: 'New caption' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
  replaceCurrentEditorSnapshotHistory({
    history,
    expectedRevision: history.getRevision(),
    exportDocument: () => ({ ...document, sourceName: 'Derived' }),
  });
  expect(readEditorHistoryEntries(history)[1]?.action?.operation).toBe('rename');
});

it('publishes a new projection revision when an append replaces the oldest retained entry', () => {
  const base = createMockDocument();
  const history = createEditorSnapshotHistory(base, { maxActions: 2, maxBytes: 100_000 });
  const push = (displayName: string) =>
    pushEditorSnapshotHistory({
      history,
      muted: false,
      exportDocument: () => ({ ...base, displayName }),
    });
  push('First');
  push('Second');
  const before = readEditorHistoryState(history);
  push('Third');
  const after = readEditorHistoryState(history);
  expect(after).toMatchObject({ index: before.index, size: before.size });
  expect(after.revision).toBeGreaterThan(before.revision!);
});

it('does not flush pending history from list rendering', () => {
  const history = createEditorSnapshotHistory(createMockDocument());
  const committed = vi.fn();
  deferEditorSnapshotHistory(history, {
    document: { ...createMockDocument(), displayName: 'Caption' },
    isCurrent: () => true,
    onCommitted: committed,
    onFailure: vi.fn(),
  });
  expect(readEditorHistoryEntries(history).at(-1)?.pending).toBe(true);
  expect(history.getState().size).toBe(1);
  expect(committed).not.toHaveBeenCalled();
  flushDeferredEditorHistory(history);
  expect(readEditorHistoryEntries(history).at(-1)).toEqual({
    index: 1,
    action: { operation: 'rename', target: null },
    pending: false,
  });
});
