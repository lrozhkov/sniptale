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

it('admits stored 4 retained state and rejects legacy or partial labels at the owning boundary', () => {
  const entry = {
    aggregateId: 'image-1',
    createdAt: 1,
    updatedAt: 2,
    revision: 1,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture()),
    sourceTitle: null,
    sourceUrl: null,
  };
  const document = {
    ...entry.document,
    version: 4 as const,
    canvasJson: JSON.stringify({
      objects: [
        {
          sniptaleRasterOriginalData: 'sniptale-asset:editor-source',
          sniptaleRasterState: {
            version: 1,
            width: 8,
            height: 6,
            crop: { x: 2, y: 1, width: 4, height: 3 },
          },
        },
      ],
    }),
  };
  expect(parseImageWorkspaceEntry({ ...entry, document })).toEqual({ ...entry, document });
  expect(parseImageWorkspaceEntry({ ...entry, document: { ...document, version: 3 } })).toBeNull();
  expect(
    parseImageWorkspaceEntry({
      ...entry,
      document: {
        ...document,
        canvasJson: '{"objects":[{"sniptaleRasterOriginalData":"sniptale-asset:editor-source"}]}',
      },
    })
  ).toBeNull();
});
