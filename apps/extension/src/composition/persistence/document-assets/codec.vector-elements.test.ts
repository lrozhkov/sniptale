import { getDocumentAssetCodecMocks } from './codec.test-support';
import { expect, it } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import {
  hydratePersistedEditorDocument,
  materializePersistedEditorDocumentForLegacyTransfer,
  preparePersistedEditorDocument,
} from './codec';
import { parsePersistedEditorDocument } from './parser';

const mocks = getDocumentAssetCodecMocks();

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

it('stores vector definitions once without image URLs and restores exact offline artwork', async () => {
  const document = await vectorDocumentFixture();
  const blobs = new Map<string, Blob>();
  const write = mocks.writeBlobToAsset.getMockImplementation()!;
  mocks.writeBlobToAsset.mockImplementation(async (blob: Blob) => {
    const prepared = await write(blob);
    blobs.set(prepared.ref.assetId, blob);
    return prepared;
  });
  mocks.readAssetFile.mockImplementation(async (ref) => blobs.get(ref.assetId));
  const prepared = await preparePersistedEditorDocument(document);
  expect(prepared.document.version).toBe(5);
  expect(prepared.objects).toHaveLength(2);
  expect(JSON.stringify(prepared.document)).not.toContain('<svg');
  expect(prepared.vectorAssetsByDefinitionId.size).toBe(1);
  expect(parsePersistedEditorDocument(prepared.document)).toEqual(prepared.document);
  const hydrated = await hydratePersistedEditorDocument({
    document: prepared.document,
    refs: prepared.refs,
  });
  expect(hydrated.document).toEqual(document);
  expect(hydrated.assetsByVectorDefinitionId).toEqual(prepared.vectorAssetsByDefinitionId);
  mocks.writeBlobToAsset.mockClear();
  const reused = await preparePersistedEditorDocument(hydrated.document, {
    reusableAssetsByRuntimeUrl: hydrated.assetsByRuntimeUrl,
    reusableAssetsByVectorDefinitionId: hydrated.assetsByVectorDefinitionId,
  });
  expect(reused.objects).toEqual([]);
  expect(mocks.writeBlobToAsset).not.toHaveBeenCalled();
  const transferred = await materializePersistedEditorDocumentForLegacyTransfer({
    document: prepared.document,
    refs: prepared.refs,
  });
  expect(transferred).toEqual(document);
  hydrated.release();
  expect(hydrated.assetsByVectorDefinitionId.size).toBe(0);
  expect(
    transferred.version === 4 && Object.keys(transferred.vectorDefinitions ?? {})
  ).toHaveLength(1);
});

it('refuses corrupted vector bytes and mismatched pointer roles before returning a document', async () => {
  const document = await vectorDocumentFixture();
  const blobs = new Map<string, Blob>();
  const write = mocks.writeBlobToAsset.getMockImplementation()!;
  mocks.writeBlobToAsset.mockImplementation(async (blob: Blob) => {
    const prepared = await write(blob);
    blobs.set(prepared.ref.assetId, blob);
    return prepared;
  });
  const prepared = await preparePersistedEditorDocument(document);
  const definition = Object.values(document.vectorDefinitions)[0]!;
  const ref = prepared.vectorAssetsByDefinitionId.get(definition.id)!;
  blobs.set(
    ref.assetId,
    new Blob([JSON.stringify({ ...definition, svg: '<svg/>' })], { type: 'application/json' })
  );
  mocks.readAssetFile.mockImplementation(async (ref) => blobs.get(ref.assetId));
  await expect(
    hydratePersistedEditorDocument({ document: prepared.document, refs: prepared.refs })
  ).rejects.toThrow('identity');
  expect(
    parsePersistedEditorDocument({
      ...prepared.document,
      assets: prepared.document.assets.filter(({ role }) => !role.startsWith('vector:')),
    })
  ).toBeNull();
  expect(parsePersistedEditorDocument({ ...prepared.document, version: 4 })).toBeNull();
});
