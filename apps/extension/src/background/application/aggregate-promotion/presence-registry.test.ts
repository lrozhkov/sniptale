import { beforeEach, expect, it } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import {
  clearAggregateEditorPresenceForTests,
  listAggregateEditorPresence,
  registerAggregateEditorPresence,
} from './presence-registry';

beforeEach(() => clearAggregateEditorPresenceForTests());

function createPresence(documentId: string, id: string) {
  const fixture = createRuntimePortFixture();
  return {
    fixture,
    presence: {
      aggregate: { id, kind: 'image' as const },
      documentId,
      port: fixture.port,
      senderUrl: `chrome-extension://id/editor.html?assetId=${id}`,
    },
  };
}

it('keeps aggregate and document identities isolated and unregisters the last document', () => {
  const first = createPresence('document-1', 'image-1');
  const second = createPresence('document-2', 'image-1');
  const other = createPresence('document-1', 'image-2');
  const unregisterFirst = registerAggregateEditorPresence(first.presence);
  registerAggregateEditorPresence(second.presence);
  registerAggregateEditorPresence(other.presence);

  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toHaveLength(2);
  expect(listAggregateEditorPresence({ id: 'missing', kind: 'image' })).toEqual([]);
  unregisterFirst();
  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toEqual([second.presence]);
});

it('disconnects a replaced document and makes its stale unregister callback harmless', () => {
  const original = createPresence('document-1', 'image-1');
  const replacement = createPresence('document-1', 'image-1');
  const unregisterOriginal = registerAggregateEditorPresence(original.presence);
  const unregisterReplacement = registerAggregateEditorPresence(replacement.presence);

  expect(original.fixture.disconnect).toHaveBeenCalledOnce();
  unregisterOriginal();
  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toEqual([
    replacement.presence,
  ]);
  unregisterReplacement();
  expect(listAggregateEditorPresence({ id: 'image-1', kind: 'image' })).toEqual([]);
});

it('does not disconnect when the same document re-registers the same port', () => {
  const current = createPresence('document-1', 'image-1');
  registerAggregateEditorPresence(current.presence);
  registerAggregateEditorPresence(current.presence);

  expect(current.fixture.disconnect).not.toHaveBeenCalled();
});
