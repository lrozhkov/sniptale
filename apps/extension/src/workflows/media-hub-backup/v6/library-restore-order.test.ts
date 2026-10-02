import { expect, it } from 'vitest';
import { orderLibraryRestoreRoots } from './library-restore-order';
import type { ArchiveRootDescriptor } from '../../../composition/archive-transfer';
const root = (rootId: string): ArchiveRootDescriptor => ({
  rootId,
  rootKind: 'media',
  mediaSubtype: 'library-item',
  metadataPath: `${rootId}.json`,
  objectCount: 0,
  totalBytes: 0,
});

it('resolves shared dependencies across shards without changing other profile slots', async () => {
  const project: ArchiveRootDescriptor = {
    rootId: 'project',
    rootKind: 'video-project',
    metadataPath: 'project.json',
    objectCount: 0,
    totalBytes: 0,
  };
  const result = await orderLibraryRestoreRoots(
    [root('review'), root('audio'), root('other'), project],
    async (entry) => (entry.rootId === 'review' ? ['audio', 'audio'] : [])
  );
  expect(result.map((entry) => entry.rootId)).toEqual(['audio', 'other', 'review', 'project']);
});

it.each([{ review: ['missing'] }, { review: ['audio'], audio: ['review'] }])(
  'rejects missing or circular public dependencies before publication: %j',
  async (refs: Record<string, string[]>) => {
    await expect(
      orderLibraryRestoreRoots(
        [root('review'), root('audio')],
        async (entry) => refs[entry.rootId] ?? []
      )
    ).rejects.toThrow();
  }
);
