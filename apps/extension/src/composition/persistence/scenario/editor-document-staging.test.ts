import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';

const mocks = vi.hoisted(() => ({
  discardPreparedAsset: vi.fn(),
  preparePersistedEditorDocument: vi.fn(),
  removeEditorDocumentOwnership: vi.fn(),
  replaceEditorDocumentAssetOwnership: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  discardPreparedAsset: mocks.discardPreparedAsset,
}));

vi.mock('../document-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document-assets')>()),
  preparePersistedEditorDocument: mocks.preparePersistedEditorDocument,
  removeEditorDocumentOwnership: mocks.removeEditorDocumentOwnership,
  replaceEditorDocumentAssetOwnership: mocks.replaceEditorDocumentAssetOwnership,
}));

import {
  discardPreparedScenarioEditorDocuments,
  prepareScenarioEditorDocumentMutations,
} from './editor-document-staging';

const ref = {
  assetId: 'document-source',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/document-source' },
  mimeType: 'image/png',
  sha256: null,
  size: 10,
};
const persisted = createPersistedEditorDocumentFixture(createEditorDocumentFixture(), ref.assetId);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discardPreparedAsset.mockResolvedValue(undefined);
  mocks.preparePersistedEditorDocument.mockResolvedValue({
    document: persisted,
    objects: [{ ref }],
  });
  mocks.removeEditorDocumentOwnership.mockResolvedValue(undefined);
  mocks.replaceEditorDocumentAssetOwnership.mockResolvedValue(undefined);
});

it('prepares document assets while preserving the other child mutations', async () => {
  const runtimeDocument = createEditorDocumentFixture();
  await expect(
    prepareScenarioEditorDocumentMutations({
      assetDeletes: ['deleted-asset'],
      assetPuts: [],
      editorDocumentDeletes: ['deleted-step'],
      editorDocumentPuts: [
        {
          createdAt: 1,
          document: runtimeDocument,
          projectId: 'project-1',
          stepId: 'step-1',
          updatedAt: 1,
        },
      ],
    })
  ).resolves.toEqual({
    assetDeletes: ['deleted-asset'],
    assetPuts: [],
    editorDocumentDeletes: ['deleted-step'],
    editorDocumentPuts: [
      expect.objectContaining({ assetRefs: [ref], document: persisted, stepId: 'step-1' }),
    ],
  });
  await expect(prepareScenarioEditorDocumentMutations(undefined)).resolves.toBeUndefined();
});

it('cleans earlier documents and aggregates cleanup failure when preparation stops', async () => {
  const writeFailure = new Error('write failed');
  const cleanupFailure = new Error('cleanup failed');
  mocks.preparePersistedEditorDocument
    .mockResolvedValueOnce({ document: persisted, objects: [{ ref }] })
    .mockRejectedValueOnce(writeFailure);
  mocks.discardPreparedAsset.mockRejectedValueOnce(cleanupFailure);
  const entry = {
    createdAt: 1,
    document: createEditorDocumentFixture(),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 1,
  };

  await expect(
    prepareScenarioEditorDocumentMutations({ editorDocumentPuts: [entry, entry] })
  ).rejects.toMatchObject({
    name: 'AggregateError',
    errors: expect.arrayContaining([writeFailure, cleanupFailure]),
  });
});

it('discards prepared documents and surfaces physical cleanup failures', async () => {
  await expect(discardPreparedScenarioEditorDocuments(undefined)).resolves.toBeUndefined();
  mocks.discardPreparedAsset.mockRejectedValueOnce(new Error('discard failed'));
  await expect(
    discardPreparedScenarioEditorDocuments({
      editorDocumentPuts: [
        {
          assetRefs: [ref],
          createdAt: 1,
          document: persisted,
          projectId: 'project-1',
          stepId: 'step-1',
          updatedAt: 1,
        },
      ],
    })
  ).rejects.toThrow('Failed to discard scenario editor document assets');
});
