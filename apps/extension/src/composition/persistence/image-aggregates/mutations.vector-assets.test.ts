import { getImageMutationMocks, root, installTransaction } from './mutations.test-support';
import { expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createAssetPublicationJournal, discardPreparedAsset } from '../assets';
import { commitImageWorkspace } from './mutations';

const mocks = getImageMutationMocks();

async function vectorDocumentFixture() {
  const { computeEditorVectorDefinitionDigest } =
    await import('../../../features/editor/document/vector-element');
  const definition = {
    version: 1 as const,
    id: '',
    viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path id="v0" fill="#ff0000" d="M0 0L24 0L24 24Z"/></svg>',
    slots: [
      {
        id: 'c0',
        kind: 'explicit-color' as const,
        originalColor: '#ff0000',
        bindings: [{ nodeId: 'v0', attribute: 'fill' as const }],
      },
    ],
    capabilities: { palette: true, strokeScale: false },
    provenance: {
      sourceId: null,
      prefix: null,
      name: null,
      author: null,
      authorUrl: null,
      license: null,
      licenseUrl: null,
    },
  };
  definition.id = await computeEditorVectorDefinitionDigest(definition);
  return {
    ...createEditorDocumentFixture(),
    sourceImageData: 'data:image/png;base64,c291cmNl',
    version: 4 as const,
    vectorDefinitions: { [definition.id]: definition },
    canvasJson: JSON.stringify({
      objects: [
        {
          type: 'group',
          sniptaleType: 'vector-element',
          sniptaleVectorElement: {
            version: 1,
            definitionId: definition.id,
            overrides: { colors: { c0: '#0000ff' }, strokeScale: 1 },
          },
          objects: [],
        },
      ],
    }),
  };
}

it('reuses durable vector refs across native saves and journal retries', async () => {
  const media = root(2);
  installTransaction({
    media,
    workspace: {
      aggregateId: media.id,
      createdAt: 1,
      document: createPersistedEditorDocumentFixture(createEditorDocumentFixture()),
      revision: 2,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 1,
    },
  });
  const document = await vectorDocumentFixture();
  const sourceRef = {
    assetId: 'source',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/source' },
    mimeType: 'image/png',
    sha256: null,
    size: 6,
  };
  const definition = Object.values(document.vectorDefinitions)[0]!;
  const definitionRef = {
    ...sourceRef,
    assetId: 'durable-definition',
    mimeType: 'application/json',
    location: { kind: 'opfs' as const, objectKey: 'objects/durable-definition' },
  };
  const vectorRefs = new Map([[definition.id, definitionRef]]);
  const input = {
    aggregateId: media.id,
    expectedRevision: 2,
    document,
    reusableAssetsByRuntimeUrl: new Map([[document.sourceImageData, sourceRef]]),
    reusableAssetsByVectorDefinitionId: vectorRefs,
  };
  const first = await commitImageWorkspace(input);
  expect(first.documentAssetsByVectorDefinitionId).toEqual(vectorRefs);
  const second = await commitImageWorkspace({
    ...input,
    expectedRevision: first.revision,
    reusableAssetsByRuntimeUrl: first.documentAssetsByRuntimeUrl,
    reusableAssetsByVectorDefinitionId: first.documentAssetsByVectorDefinitionId,
  });
  expect(second.revision).toBe(first.revision + 1);
  expect(second.documentAssetsByVectorDefinitionId).toEqual(vectorRefs);
  expect(mocks.assetSequence).toBe(0);
  const journal = vi.mocked(createAssetPublicationJournal);
  for (const [args] of journal.mock.calls) {
    expect(args.assetRefs).toEqual([]);
    expect(args.payload).toEqual(
      expect.objectContaining({
        refs: expect.arrayContaining([sourceRef, definitionRef]),
        document: expect.objectContaining({
          vectorDefinitions: { [definition.id]: { assetId: definitionRef.assetId } },
        }),
      })
    );
    expect(args.payload).not.toHaveProperty('reusableAssetsByVectorDefinitionId');
    expect(args.payload).not.toHaveProperty('reusableAssetsByRuntimeUrl');
  }
  journal.mockRejectedValueOnce(new Error('journal refused'));
  const retryInput = { ...input, expectedRevision: second.revision };
  await expect(commitImageWorkspace(retryInput)).rejects.toThrow('journal refused');
  expect(discardPreparedAsset).not.toHaveBeenCalled();
  await expect(commitImageWorkspace(retryInput)).resolves.toEqual(
    expect.objectContaining({
      documentAssetsByVectorDefinitionId: vectorRefs,
      revision: second.revision + 1,
    })
  );
  expect(mocks.assetSequence).toBe(0);
});
