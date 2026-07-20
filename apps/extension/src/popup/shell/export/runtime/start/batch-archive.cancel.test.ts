import { expect, it } from 'vitest';
import { createBatchArchiveBlob } from './batch-archive';

function createBatchPackage() {
  return {
    pagePackage: {
      archiveBaseName: 'page',
      entries: [{ path: 'page.json', textContent: '{}' }],
      errors: [],
      stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
    },
    tabId: 1,
    tabTitle: 'page',
  };
}

it('rejects cancellation before writing batch ZIP entries', async () => {
  await expect(
    createBatchArchiveBlob([createBatchPackage()], 'grouped', { isCancelled: () => true })
  ).rejects.toThrow('Popup batch export cancelled');
});

it('rejects cancellation reported during batch ZIP generation', async () => {
  let checks = 0;

  await expect(
    createBatchArchiveBlob([createBatchPackage()], 'grouped', {
      isCancelled: () => {
        checks += 1;
        return checks > 2;
      },
    })
  ).rejects.toThrow('Popup batch export cancelled');
});
