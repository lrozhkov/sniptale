// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import {
  captureEditorHistoryCheckpoint,
  prepareEditorHistoryCheckpoint,
  restoreEditorHistoryCheckpoint,
  createEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  readCurrentEditorSnapshot,
  readEditorHistoryEntries,
  undoEditorSnapshot,
  redoEditorSnapshot,
  replaceCurrentEditorSnapshotHistory,
  deferEditorSnapshotHistory,
  flushDeferredEditorHistory,
} from './index';

it('restores current, Undo and Redo from a detached JSON checkpoint and permits a new branch', () => {
  const base = createMockDocument();
  const history = createEditorSnapshotHistory(base);
  const first = { ...base, displayName: 'First' };
  const second = { ...base, displayName: 'Second' };
  for (const document of [first, second])
    pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
  undoEditorSnapshot(history);
  const serialized = JSON.stringify(captureEditorHistoryCheckpoint(history));
  const input: unknown = JSON.parse(serialized);
  const restored = restoreEditorHistoryCheckpoint(input)!;
  expect(restored).not.toBeNull();
  expect(readCurrentEditorSnapshot(restored)).toEqual(first);
  expect(restored.getState()).toMatchObject({ index: 1, size: 3, canRedo: true, canUndo: true });
  expect(redoEditorSnapshot(restored)).toEqual(second);
  expect(undoEditorSnapshot(restored)).toEqual(first);
  const branch = { ...base, displayName: 'Branch' };
  pushEditorSnapshotHistory({ history: restored, muted: false, exportDocument: () => branch });
  expect(restored.getState().canRedo).toBe(false);
  expect(readCurrentEditorSnapshot(restored)).toEqual(branch);
  expect(readCurrentEditorSnapshot(history)).toEqual(first);
});

it('keeps shared images once, preserves action meaning and allocates fresh version IDs after reopening', () => {
  const base = {
    ...createMockDocument(),
    sourceImageData: 'data:image/png;base64,' + 'A'.repeat(12_000),
  };
  const history = createEditorSnapshotHistory(base);
  const first = { ...base, displayName: 'Caption' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => first });
  replaceCurrentEditorSnapshotHistory({
    history,
    expectedRevision: history.getRevision(),
    exportDocument: () => ({ ...first, sourceName: 'Derived preview' }),
  });
  const checkpoint = captureEditorHistoryCheckpoint(history)!;
  expect(checkpoint.values.filter((unit) => unit.kind === 'image')).toHaveLength(1);
  expect(checkpoint.snapshots.every((snapshot) => !snapshot.includes(base.sourceImageData))).toBe(
    true
  );
  const restored = restoreEditorHistoryCheckpoint(
    JSON.parse(JSON.stringify(checkpoint)) as unknown
  )!;
  expect(readEditorHistoryEntries(restored)[1]?.action?.operation).toBe('rename');
  const object = { type: 'rect', sniptaleId: 'card', sniptaleLabel: 'Card', left: 20 };
  const next = { ...first, canvasJson: JSON.stringify({ objects: [object] }) };
  pushEditorSnapshotHistory({ history: restored, muted: false, exportDocument: () => next });
  const after = captureEditorHistoryCheckpoint(restored)!;
  expect(new Set(after.values.map((unit) => unit.id)).size).toBe(after.values.length);
  for (const unit of checkpoint.values)
    expect(after.values.find((candidate) => candidate.id === unit.id)).toEqual(unit);
  expect(readCurrentEditorSnapshot(restored)).toEqual(next);
  expect(readEditorHistoryEntries(restored).at(-1)?.action?.operation).toBe('add');
});

it('captures only ready history without forcing pending encoding', () => {
  const history = createEditorSnapshotHistory(createMockDocument());
  const committed = vi.fn();
  deferEditorSnapshotHistory(history, {
    document: { ...createMockDocument(), displayName: 'Pending' },
    isCurrent: () => true,
    onCommitted: committed,
    onFailure: vi.fn(),
  });
  expect(captureEditorHistoryCheckpoint(history)).toBeNull();
  expect(committed).not.toHaveBeenCalled();
  flushDeferredEditorHistory(history);
  expect(captureEditorHistoryCheckpoint(history)?.snapshots).toHaveLength(2);
});

it('prepares a lazy capture without building the graph and refuses a changed history revision', () => {
  const history = createEditorSnapshotHistory(createMockDocument());
  const snapshots = vi.spyOn(history, 'getSnapshots');
  const capture = prepareEditorHistoryCheckpoint(history);
  expect(snapshots).not.toHaveBeenCalled();
  expect(capture()?.snapshots).toHaveLength(1);
  const obsolete = prepareEditorHistoryCheckpoint(history);
  pushEditorSnapshotHistory({
    history,
    muted: false,
    exportDocument: () => ({ ...createMockDocument(), displayName: 'Changed' }),
  });
  snapshots.mockClear();
  expect(obsolete()).toBeNull();
  expect(snapshots).not.toHaveBeenCalled();
});

it('captures a prospective caption step without changing live history or its Redo branch', () => {
  const base = { ...createMockDocument(), displayName: 'Original' };
  const history = createEditorSnapshotHistory(base);
  const future = { ...base, displayName: 'Future' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => future });
  undoEditorSnapshot(history);
  const before = captureEditorHistoryCheckpoint(history);
  const proposed = captureEditorHistoryCheckpoint(history, { ...base, displayName: 'Renamed' })!;
  expect(captureEditorHistoryCheckpoint(history)).toEqual(before);
  expect(readCurrentEditorSnapshot(history)).toEqual(base);
  expect(history.getState().canRedo).toBe(true);
  const reopened = restoreEditorHistoryCheckpoint(proposed)!;
  expect(readCurrentEditorSnapshot(reopened)?.displayName).toBe('Renamed');
  expect(readEditorHistoryEntries(reopened).at(-1)?.action?.operation).toBe('rename');
  expect(undoEditorSnapshot(reopened)).toEqual(base);
  expect(redoEditorSnapshot(reopened)?.displayName).toBe('Renamed');
  expect(reopened.getState().canRedo).toBe(false);
});

it('keeps Redo for an unchanged explicit document and applies existing retention to a proposal', () => {
  const base = createMockDocument();
  const history = createEditorSnapshotHistory(base, { maxActions: 1, maxBytes: 1_000_000 });
  const first = { ...base, displayName: 'First' };
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => first });
  undoEditorSnapshot(history);
  expect(captureEditorHistoryCheckpoint(history, base)).toEqual(
    captureEditorHistoryCheckpoint(history)
  );
  redoEditorSnapshot(history);
  const proposal = captureEditorHistoryCheckpoint(history, { ...base, displayName: 'Second' })!;
  const reopened = restoreEditorHistoryCheckpoint(proposal)!;
  expect(reopened.getState()).toMatchObject({ size: 2, index: 1 });
  expect(undoEditorSnapshot(reopened)).toEqual(first);
  expect(captureEditorHistoryCheckpoint(history)?.snapshots).toHaveLength(2);
});

it('restores canvas and rich-shape object identities for subsequent automatic action descriptions', () => {
  const shape = createDefaultRichShapeObject({ id: 'rich', shapeKind: 'rectangle' });
  const card = {
    type: 'rect',
    sniptaleId: 'card',
    sniptaleLabel: 'Card',
    left: 0,
    fill: '#12abcd',
  };
  const first = {
    ...createMockDocument(),
    canvasJson: JSON.stringify({ objects: [card] }),
    richShapes: [shape],
  };
  const second = {
    ...first,
    canvasJson: JSON.stringify({ objects: [{ ...card, left: 20 }] }),
    richShapes: [{ ...shape, rotation: 17 }],
  };
  const history = createEditorSnapshotHistory(first);
  pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => second });
  const restored = restoreEditorHistoryCheckpoint(
    JSON.parse(JSON.stringify(captureEditorHistoryCheckpoint(history))) as unknown
  )!;
  expect(restored).not.toBeNull();
  expect(readCurrentEditorSnapshot(restored)).toEqual(second);
  expect(undoEditorSnapshot(restored)).toEqual(first);
  expect(redoEditorSnapshot(restored)).toEqual(second);
  const filled = {
    ...second,
    canvasJson: JSON.stringify({ objects: [{ ...card, left: 20, fill: '#9a3f72' }] }),
  };
  pushEditorSnapshotHistory({ history: restored, muted: false, exportDocument: () => filled });
  expect(readEditorHistoryEntries(restored).at(-1)?.action).toMatchObject({
    operation: 'fill',
    target: { id: 'card', name: 'Card' },
    color: { before: '#12abcd', after: '#9a3f72' },
  });
  expect(undoEditorSnapshot(restored)).toEqual(second);
});

it('keeps nested group action descriptions identical after a checkpoint roundtrip', () => {
  const document = {
    ...createMockDocument(),
    canvasJson: JSON.stringify({
      objects: [
        {
          type: 'Group',
          sniptaleId: 'group',
          objects: [
            {
              type: 'Group',
              sniptaleId: 'nested',
              objects: [{ type: 'Rect', sniptaleId: 'card', sniptaleLabel: 'Card', left: 0 }],
            },
          ],
        },
      ],
    }),
  };
  const history = createEditorSnapshotHistory(document);
  const restored = restoreEditorHistoryCheckpoint(
    JSON.parse(JSON.stringify(captureEditorHistoryCheckpoint(history))) as unknown
  )!;
  for (const displayName of ['Renamed project', 'Renamed again']) {
    const next = { ...document, displayName };
    for (const target of [history, restored])
      pushEditorSnapshotHistory({ history: target, muted: false, exportDocument: () => next });
    expect(readEditorHistoryEntries(history).at(-1)?.action?.operation).toBe('rename');
    expect(readEditorHistoryEntries(restored)).toEqual(readEditorHistoryEntries(history));
  }
  expect(readEditorHistoryEntries(restored).at(-1)?.action?.operation).toBe('rename');
});

it('restores a retained prefix baseline and rejects a bad checkpoint without touching the active history', () => {
  const base = createMockDocument();
  const limits = { maxActions: 2, maxBytes: 100_000 };
  const history = createEditorSnapshotHistory(base, limits);
  for (const displayName of ['A', 'B', 'C'])
    pushEditorSnapshotHistory({
      history,
      muted: false,
      exportDocument: () => ({ ...base, displayName }),
    });
  undoEditorSnapshot(history);
  const checkpoint = captureEditorHistoryCheckpoint(history)!;
  const before = history.getState();
  expect(restoreEditorHistoryCheckpoint({ ...checkpoint, cursor: -1 }, limits)).toBeNull();
  expect(history.getState()).toEqual(before);
  const restored = restoreEditorHistoryCheckpoint(checkpoint, limits)!;
  expect(readEditorHistoryEntries(restored)[0]?.action).toBeNull();
  expect(undoEditorSnapshot(restored)?.displayName).toBe('A');
  expect(redoEditorSnapshot(restored)?.displayName).toBe('B');
  expect(redoEditorSnapshot(restored)?.displayName).toBe('C');
});
