import { expect, it } from 'vitest';

import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';
import {
  createEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  redoEditorSnapshot,
  undoEditorSnapshot,
} from './';

it('round-trips editor documents through snapshot history', () => {
  const first = createMockDocument();
  const second = {
    ...createMockDocument(),
    sourceName: 'second.png',
  };
  const history = createEditorSnapshotHistory(first);

  expect(pushEditorSnapshotHistory({ exportDocument: () => second, history, muted: false })).toBe(
    true
  );
  expect(undoEditorSnapshot(history)).toEqual(first);
  expect(redoEditorSnapshot(history)).toEqual(second);
});

it('rejects malformed or invalid editor document snapshots', () => {
  const malformedHistory = new SnapshotHistory<string>('not-json');
  malformedHistory.push(JSON.stringify(createMockDocument()));
  expect(undoEditorSnapshot(malformedHistory)).toBeNull();

  const invalidShapeHistory = new SnapshotHistory<string>(JSON.stringify({ version: 1 }));
  invalidShapeHistory.push(JSON.stringify(createMockDocument()));
  expect(undoEditorSnapshot(invalidShapeHistory)).toBeNull();
});
