import { expect, it } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { parseImageWorkspaceEntry } from './parser';

it('sanitizes legacy workspace provenance before background maintenance', () => {
  expect(
    parseImageWorkspaceEntry({
      aggregateId: 'image-1',
      createdAt: 1,
      updatedAt: 2,
      revision: 1,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source-1'),
      sourceTitle: null,
      sourceUrl: 'https://user:pass@example.com/page?token=secret#fragment',
    })
  ).toMatchObject({ sourceUrl: 'https://example.com/page' });
});
