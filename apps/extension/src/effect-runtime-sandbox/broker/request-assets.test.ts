import { expect, it } from 'vitest';

import { sha256EffectV1Bytes, type EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import { createDocument } from '../worker/interpreter/support.test-support';
import { parseVisualAssets } from './request-assets';

it('accepts the exact declared visual byte set and ignores declared audio', async () => {
  const imageBytes = createPngHeader();
  const svgBytes = new TextEncoder().encode('<svg viewBox="0 0 1 1"></svg>');
  const document = await createAssetDocument(imageBytes, svgBytes);
  const candidates = [
    createCandidate(document, 'image', imageBytes),
    createCandidate(document, 'svg', svgBytes),
  ];

  await expect(parseVisualAssets(candidates, document)).resolves.toMatchObject([
    { id: 'image', kind: 'image' },
    { id: 'svg', kind: 'svg' },
  ]);
});

it('rejects collection, metadata, digest, signature, duplicate, and byte-budget drift', async () => {
  const bytes = createPngHeader();
  const document = await createAssetDocument(bytes, new TextEncoder().encode('<svg/>'));
  const valid = createCandidate(document, 'image', bytes);
  const svg = createCandidate(document, 'svg', new TextEncoder().encode('<svg/>'));

  await expect(parseVisualAssets(null, document)).resolves.toBeNull();
  await expect(parseVisualAssets([], document)).resolves.toBeNull();
  await expect(parseVisualAssets([null, svg], document)).resolves.toBeNull();
  await expect(parseVisualAssets([{ ...valid, extra: true }, svg], document)).resolves.toBeNull();
  await expect(parseVisualAssets([{ ...valid, id: 'missing' }, svg], document)).resolves.toBeNull();
  await expect(
    parseVisualAssets([{ ...valid, bytes: bytes.slice(0, -1).buffer }, svg], document)
  ).resolves.toBeNull();
  const forged = bytes.slice();
  forged[23] = 2;
  await expect(
    parseVisualAssets([{ ...valid, bytes: forged.buffer }, svg], document)
  ).resolves.toBeNull();
  await expect(
    parseVisualAssets([valid, { ...svg, bytes: new Uint8Array([1]).buffer }], document)
  ).resolves.toBeNull();
  await expect(parseVisualAssets([valid, { ...valid }, svg], document)).resolves.toBeNull();
});

async function createAssetDocument(
  imageBytes: Uint8Array,
  svgBytes: Uint8Array
): Promise<EffectV1Document> {
  const document = createDocument([{ op: 'clear' }]);
  document.assets = [
    await createDeclaration('image', 'image', 'image/png', imageBytes),
    await createDeclaration('svg', 'svg', 'image/svg+xml', svgBytes),
    await createDeclaration('audio', 'audio', 'audio/wav', Uint8Array.of(1)),
  ];
  return document;
}

async function createDeclaration(
  id: string,
  kind: 'audio' | 'image' | 'svg',
  mimeType: string,
  bytes: Uint8Array
) {
  return {
    byteLength: bytes.byteLength,
    id,
    kind,
    mimeType,
    path: `assets/${id}`,
    sha256: await sha256EffectV1Bytes(bytes),
  };
}

function createCandidate(document: EffectV1Document, id: string, bytes: Uint8Array) {
  const declaration = document.assets.find((asset) => asset.id === id)!;
  return {
    byteLength: bytes.byteLength,
    bytes: bytes.slice().buffer,
    id,
    kind: declaration.kind,
    mimeType: declaration.mimeType,
    sha256: declaration.sha256!,
  };
}

function createPngHeader(): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, 1);
  new DataView(bytes.buffer).setUint32(20, 1);
  return bytes;
}
