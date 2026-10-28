import { expect, it } from 'vitest';
import { createRemoteRootGalleryItem } from '../library/items/adapters';
import { getFilteredGalleryItems } from './selectors';

it('searches and filters checked remote presentation without native media rows', () => {
  const remote = createRemoteRootGalleryItem({
    source: 'remote',
    tags: ['remote-topic'],
    label: 'Remote project',
    kind: 'image',
    mimeType: 'image/png',
    size: 1024,
    createdAt: 10,
    updatedAt: 20,
    conflict: false,
    unavailable: false,
    deleted: false,
    selection: {
      rootKind: 'media',
      rootId: 'remote-root',
      operationId: 'operation-1',
      sourceDigest: 'a'.repeat(64),
    },
  });
  const inputs = {
    items: [remote],
    activeTags: [],
    folderFilter: 'screenshot' as const,
    search: 'remote',
    scope: 'library' as const,
    sortMode: 'newest' as const,
  };
  expect(getFilteredGalleryItems(inputs)).toEqual([remote]);
  expect(getFilteredGalleryItems({ ...inputs, activeTags: ['remote-topic'] })).toEqual([remote]);
  expect(getFilteredGalleryItems({ ...inputs, activeTags: ['missing-topic'] })).toEqual([]);
  expect(getFilteredGalleryItems({ ...inputs, folderFilter: 'audio' })).toEqual([]);
  expect(getFilteredGalleryItems({ ...inputs, scope: 'temporary' })).toEqual([]);
});
