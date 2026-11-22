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

it('keeps an imported raster outside structural history and preserves it across Undo, reopen and branching', () => {
  const limits = { maxActions: 10, maxBytes: 3000, maxAssetBytes: 6000 };
  const base = createMockDocument();
  const renamed = { ...base, displayName: 'Before import' };
  const image = 'data:image/png;base64,' + 'A'.repeat(7000);
  const imported = {
    ...renamed,
    canvasJson: JSON.stringify({ objects: [{ type: 'image', sniptaleId: 'layer', src: image }] }),
  };
  const history = createEditorSnapshotHistory(base, limits);
  for (const document of [renamed, imported])
    pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
  expect(history.getSnapshots()).toHaveLength(3);
  expect(undoEditorSnapshot(history)).toEqual(renamed);
  const restored = restoreEditorHistoryCheckpoint(
    JSON.parse(JSON.stringify(captureEditorHistoryCheckpoint(history))) as unknown,
    limits
  )!;
  expect(restored).not.toBeNull();
  expect(redoEditorSnapshot(restored)).toEqual(imported);
  expect(undoEditorSnapshot(restored)).toEqual(renamed);
  const branch = { ...renamed, displayName: 'New branch' };
  pushEditorSnapshotHistory({ history: restored, muted: false, exportDocument: () => branch });
  expect(redoEditorSnapshot(restored)).toBeNull();
  expect(
    captureEditorHistoryCheckpoint(restored)!.values.some((unit) => unit.value === image)
  ).toBe(false);
});

it('bounds superseded raster versions independently of structural metadata', () => {
  const limits = { maxActions: 10, maxBytes: 20_000, maxAssetBytes: 6000 };
  const base = createMockDocument();
  const documents = ['A', 'B', 'C'].map((character) => ({
    ...base,
    canvasJson: JSON.stringify({
      objects: [
        {
          type: 'image',
          sniptaleId: 'layer',
          src: 'data:image/png;base64,' + character.repeat(5000),
        },
      ],
    }),
  }));
  const history = createEditorSnapshotHistory(base, limits);
  for (const document of documents)
    pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
  expect(history.getSnapshots()).toHaveLength(2);
  expect(undoEditorSnapshot(history)).toEqual(documents[1]);
  expect(undoEditorSnapshot(history)).toBeNull();
  expect(redoEditorSnapshot(history)).toEqual(documents[2]);
  const checkpoint = captureEditorHistoryCheckpoint(history)!;
  expect(checkpoint.values.filter((unit) => unit.kind === 'image')).toHaveLength(2);
  expect(restoreEditorHistoryCheckpoint(checkpoint, limits)).not.toBeNull();
});

it('preserves affordable Redo through a derived raster update while undone', () => {
  const limits = { maxActions: 10, maxBytes: 20_000, maxAssetBytes: 6000 };
  const base = createMockDocument();
  const makeDocument = (displayName: string, rasters: string) => ({
    ...base,
    displayName,
    canvasJson: JSON.stringify({
      objects: [...rasters].map((character) => ({
        type: 'image',
        sniptaleId: character,
        src: 'data:image/png;base64,' + character.repeat(5000),
      })),
    }),
  });
  const first = makeDocument('First', 'A');
  const without = makeDocument('Without image', '');
  const returned = makeDocument('Image restored', 'A');
  const last = makeDocument('Last', '');
  const history = createEditorSnapshotHistory(first, limits);
  for (const document of [without, returned, last])
    pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
  expect(history.getState().size).toBe(4);
  history.seek(0);
  const updated = makeDocument('First', 'AB');
  expect(
    replaceCurrentEditorSnapshotHistory({
      history,
      expectedRevision: history.getRevision(),
      exportDocument: () => updated,
    })
  ).toBe(true);
  const restored = restoreEditorHistoryCheckpoint(captureEditorHistoryCheckpoint(history), limits)!;
  expect(readCurrentEditorSnapshot(restored)).toEqual(updated);
  expect(redoEditorSnapshot(restored)).toEqual(without);
  expect(redoEditorSnapshot(restored)).toEqual(returned);
  expect(redoEditorSnapshot(restored)).toBeNull();
});

it('keeps every captured raster graph admissible through cursor, replacement, overflow and branch changes', () => {
  const limits = { maxActions: 6, maxBytes: 3000, maxAssetBytes: 6000 };
  const base = createMockDocument();
  const history = createEditorSnapshotHistory(base, limits);
  for (let step = 1; step <= 60; step++) {
    const before = history.getSnapshots().length;
    if (step % 7 === 0) {
      undoEditorSnapshot(history);
      expect(history.getSnapshots()).toHaveLength(before);
    } else if (step % 11 === 0) {
      redoEditorSnapshot(history);
      expect(history.getSnapshots()).toHaveLength(before);
    } else {
      const image =
        'data:image/png;base64,' +
        String.fromCharCode(65 + (step % 8)).repeat(step % 3 ? 5000 : 1000);
      const document = {
        ...base,
        displayName: `Edit ${step}`,
        canvasJson: JSON.stringify({
          objects: [{ type: 'image', sniptaleId: 'layer', src: image }],
        }),
      };
      if (step % 5 === 0)
        replaceCurrentEditorSnapshotHistory({
          history,
          expectedRevision: history.getRevision(),
          exportDocument: () => document,
        });
      else pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
      expect(readCurrentEditorSnapshot(history)).toEqual(document);
    }
    const restored = restoreEditorHistoryCheckpoint(
      captureEditorHistoryCheckpoint(history),
      limits
    );
    expect(restored, `admission after operation ${step}`).not.toBeNull();
    expect(readCurrentEditorSnapshot(restored)).toEqual(readCurrentEditorSnapshot(history));
    expect(restored!.getSnapshots()).toHaveLength(history.getSnapshots().length);
  }
});
