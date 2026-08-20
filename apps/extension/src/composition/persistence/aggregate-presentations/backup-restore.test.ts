import { expect, it, vi } from 'vitest';
import { putAggregatePresentationBackupRestore } from './backup-restore';

it('publishes a reconstructed presentation through the caller transaction', async () => {
  const put = vi.fn();
  const entry = {
    aggregateId: 'image',
    aggregateKind: 'image',
    presentationRevision: 1,
    thumbnailBlob: new Blob(['x']),
    updatedAt: 1,
  } as const;
  await putAggregatePresentationBackupRestore({ entry, store: { put } });
  expect(put).toHaveBeenCalledWith(entry);
});
