import { createDbHarness, createRef, getAssetPublicationRecoveryMocks } from './index.test-support';
import { expect, it, vi } from 'vitest';
import { recoverPendingAssetPublications } from './index';

const mocks = getAssetPublicationRecoveryMocks();

it('replays registered vector ready journals and removes intent only after publication acknowledgement', async () => {
  const { recoverStandaloneAssetPublications } = await import('../assets/recovery');
  const { editorVectorPublicationAdapter } = await import('../vector-elements');
  const harness = createDbHarness([]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));
  mocks.recoverStandalone.mockImplementation(recoverStandaloneAssetPublications);
  const definitionId = 'a'.repeat(64);
  const journal = {
    assetRefs: [createRef('vector-bytes')],
    createdAt: 1,
    domain: 'editor-vector-definition',
    journalId: 'vector-ready',
    payload: {
      kind: 'definition',
      key: `definition:${definitionId}`,
      definitionId,
      assetId: 'vector-bytes',
      incarnation: 'published-incarnation',
      retained: true,
    },
  };
  mocks.journals.mockResolvedValue([journal]);
  let acknowledge: () => void = () => undefined;
  const publishing = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let enter: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const publish = vi
    .spyOn(editorVectorPublicationAdapter, 'publish')
    .mockImplementation(async () => {
      enter();
      await publishing;
    });
  try {
    const recovery = recoverPendingAssetPublications();
    await entered;
    expect(publish).toHaveBeenCalledWith(journal, expect.anything(), expect.anything());
    expect(mocks.deleteJournal).not.toHaveBeenCalled();
    acknowledge();
    await expect(recovery).resolves.toBe(1);
    expect(mocks.deleteJournal).toHaveBeenCalledExactlyOnceWith('vector-ready');
  } finally {
    acknowledge();
    publish.mockRestore();
  }
});
