import { installTransaction } from './mutations.test-support';
import { expect, it } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { commitImageWorkspace } from './mutations';

it('does not recreate a purged original image on the first editor save', async () => {
  const puts = installTransaction({ sourceId: 'image-1' });
  const input = {
    aggregateId: 'image-1',
    document: createEditorDocumentFixture(),
    expectedRevision: 0,
    requireExistingRoot: true,
  };
  await expect(commitImageWorkspace(input)).rejects.toThrow();
  expect(puts.media).not.toHaveBeenCalled();
  expect(puts.workspace).not.toHaveBeenCalled();
});
