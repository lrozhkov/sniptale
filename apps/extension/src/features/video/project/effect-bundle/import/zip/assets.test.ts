import { readFileSync } from 'node:fs';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
  type EffectV1Asset,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  ZipCentralDirectoryError,
  type ZipCentralDirectoryEntry,
} from '@sniptale/platform/data/zip-profile/central-directory';

import { createEffectBundleFailure } from '../../diagnostics';
import { materializeDocumentAssets } from '../assets';
import {
  assertEffectBundleZipLimits,
  isExecutableEntry,
  mapArchiveError,
  readDeclaredEntry,
  readZipEntry,
  validateSafeZipEntryClosure,
  verifyEntryBytes,
  verifyEntryIntegrity,
} from './archive';
import type { EffectBundleAssetManifestEntry, EffectBundleManifest } from '../../manifest';

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('EffectV1 asset materialization', () => {
  it('materializes verified embedded bytes', async () => {
    const asset = await createEmbeddedPngAsset();
    const result = await materializeDocumentAssets(createDocument(asset), [], new Map(), new Map());

    expect(result).toEqual(
      expect.objectContaining({
        assets: [expect.objectContaining({ byteLength: PNG_BYTES.byteLength, id: 'mark' })],
        ok: true,
      })
    );
  });

  it('fails closed on embedded digest, encoding, and signature mismatches', async () => {
    const asset = await createEmbeddedPngAsset();

    await expect(materializeSingle({ ...asset, sha256: '0'.repeat(64) })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ASSET_CLOSURE' })
    );
    await expect(materializeSingle({ ...asset, dataUrl: 'not-base64' })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ASSET_CLOSURE' })
    );
    await expect(
      materializeSingle({
        ...asset,
        dataUrl: toDataUrl(Uint8Array.from([1, 2, 3])),
        byteLength: 3,
        sha256: await sha256EffectV1Bytes(Uint8Array.from([1, 2, 3])),
      })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ASSET_MIME_MISMATCH' }));
  });
});

describe('EffectV1 path asset materialization', () => {
  it('requires path assets to match one exact manifest declaration', async () => {
    const hash = await sha256EffectV1Bytes(PNG_BYTES);
    const asset: EffectV1Asset = {
      byteLength: PNG_BYTES.byteLength,
      id: 'mark',
      kind: 'image',
      mimeType: 'image/png',
      path: 'assets/mark.png',
      sha256: hash,
    };
    const declaration: EffectBundleAssetManifestEntry = {
      byteLength: PNG_BYTES.byteLength,
      kind: 'image',
      mimeType: 'image/png',
      path: 'assets/mark.png',
      sha256: hash,
    };
    const used = new Map<string, EffectBundleAssetManifestEntry>();

    await expect(
      materializeDocumentAssets(
        createDocument(asset),
        [declaration],
        new Map([[declaration.path, PNG_BYTES]]),
        used
      )
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(used.get(declaration.path)).toEqual(declaration);
    await expect(
      materializeDocumentAssets(createDocument(asset), [], new Map(), new Map())
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ASSET_CLOSURE' }));
  });
});

describe('EffectV1 ZIP entry integrity helpers', () => {
  it('distinguishes size, digest, signature, and accepted content', async () => {
    const hash = await sha256EffectV1Bytes(PNG_BYTES);
    const declaration = createAssetDeclaration(hash);

    await expect(verifyEntryIntegrity(PNG_BYTES, declaration)).resolves.toBeNull();
    await expect(verifyEntryIntegrity(PNG_BYTES.subarray(0, 3), declaration)).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_SIZE_MISMATCH' })
    );
    await expect(
      verifyEntryIntegrity(PNG_BYTES, { ...declaration, sha256: '0'.repeat(64) })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_HASH_MISMATCH' }));
    await expect(verifyEntryBytes(PNG_BYTES, declaration)).resolves.toBeNull();
    await expect(
      verifyEntryBytes(PNG_BYTES, { ...declaration, mimeType: 'image/jpeg' })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ASSET_MIME_MISMATCH' }));
  });

  it('reads only declared entries and verifies inflated sizes', async () => {
    const zip = new JSZip();
    zip.file('assets/mark.png', PNG_BYTES);
    const archive = await zip.generateAsync({ compression: 'DEFLATE', type: 'uint8array' });
    const entry = assertEffectBundleZipLimits(archive).entries[0]!;
    const entries = new Map([[entry.name, entry]]);

    await expect(readDeclaredEntry(archive, entries, { path: entry.name })).resolves.toEqual(
      expect.objectContaining({ ok: true })
    );
    await expect(
      readDeclaredEntry(archive, entries, { path: 'assets/missing.png' })
    ).resolves.toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_MISSING' }));
    await expect(readZipEntry(archive, { ...entry, uncompressedSize: 1 })).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_SIZE_MISMATCH' })
    );
  });

  it('stops DEFLATE extraction when output exceeds forged metadata', async () => {
    const archive = await new JSZip()
      .file('bomb.bin', new Uint8Array(1024 * 1024), { compression: 'DEFLATE' })
      .generateAsync({ compression: 'DEFLATE', type: 'uint8array' });
    forgeZipEntryUncompressedSize(archive, 8);
    const entry = assertEffectBundleZipLimits(archive).entries[0]!;

    await expect(readZipEntry(archive, entry)).resolves.toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_SIZE_MISMATCH' })
    );
  });
});

describe('EffectV1 ZIP closure and error mapping', () => {
  it('checks exact archive closure and executable paths', () => {
    const manifest = createManifest();
    const complete = new Map([
      ['manifest.json', createZipEntry('manifest.json', 1)],
      ['effects/demo.sniptale-effect.json', createZipEntry('effects/demo.sniptale-effect.json', 1)],
    ]);

    expect(validateSafeZipEntryClosure(complete, manifest)).toBeNull();
    expect(
      validateSafeZipEntryClosure(
        new Map([...complete, ['extra.txt', createZipEntry('extra.txt', 1)]]),
        manifest
      )
    ).toEqual(expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_UNDECLARED' }));
    expect(validateSafeZipEntryClosure(new Map(), manifest)).toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ENTRY_MISSING' })
    );
    expect(isExecutableEntry('renderers/main.source')).toBe(true);
    expect(isExecutableEntry('assets/runtime.WASM')).toBe(true);
    expect(isExecutableEntry('assets/mark.png')).toBe(false);
  });

  it.each([
    ['limit-exceeded', 'BUNDLE_LIMIT_EXCEEDED'],
    ['entry-collision', 'BUNDLE_ENTRY_COLLISION'],
    ['entry-special', 'BUNDLE_ENTRY_SPECIAL'],
    ['entry-unsupported', 'BUNDLE_ARCHIVE_INVALID'],
  ] as const)('maps %s without exposing archive exceptions', (code, primaryCode) => {
    expect(mapArchiveError(new ZipCentralDirectoryError(code, 'private', 'assets/item'))).toEqual(
      expect.objectContaining({ primaryCode })
    );
  });

  it('preserves stable failures and normalizes unknown exceptions', () => {
    const failure = createEffectBundleFailure('BUNDLE_ENTRY_PATH_UNSAFE', '../escape');
    expect(mapArchiveError(failure)).toBe(failure);
    expect(mapArchiveError(new Error('private'))).toEqual(
      expect.objectContaining({ primaryCode: 'BUNDLE_ARCHIVE_INVALID' })
    );
  });
});

async function materializeSingle(asset: EffectV1Asset) {
  return materializeDocumentAssets(createDocument(asset), [], new Map(), new Map());
}

async function createEmbeddedPngAsset(): Promise<EffectV1Asset> {
  return {
    byteLength: PNG_BYTES.byteLength,
    dataUrl: toDataUrl(PNG_BYTES),
    id: 'mark',
    kind: 'image',
    mimeType: 'image/png',
    sha256: await sha256EffectV1Bytes(PNG_BYTES),
  };
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

function createDocument(asset: EffectV1Asset): EffectV1Document {
  const input: unknown = JSON.parse(readFileSync(fixtureUrl(), 'utf8'));
  const validation = validateEffectV1Document(input);
  if (!validation.document) throw new Error('Expected valid EffectV1 fixture');
  return { ...validation.document, assets: [asset] };
}

function fixtureUrl(): URL {
  return new URL(
    '../../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
      'neutral-standalone.sniptale-effect.json',
    import.meta.url
  );
}

function createAssetDeclaration(hash: string): EffectBundleAssetManifestEntry {
  return {
    byteLength: PNG_BYTES.byteLength,
    kind: 'image',
    mimeType: 'image/png',
    path: 'assets/mark.png',
    sha256: hash,
  };
}

function createManifest(): EffectBundleManifest {
  return {
    assets: [],
    effectDocuments: [
      {
        byteLength: 1,
        id: 'demo',
        path: 'effects/demo.sniptale-effect.json',
        schemaVersion: 'sniptale.effect.v1',
        sha256: 'a'.repeat(64),
      },
    ],
    engineVersion: '2.0',
    label: { en: 'Demo', ru: 'Демо' },
    manifestVersion: 'sniptale.bundle.v1',
    packId: 'sniptale.demo',
    version: '1.0.0',
  };
}

function createZipEntry(name: string, uncompressedSize: number): ZipCentralDirectoryEntry {
  return {
    compressedSize: uncompressedSize,
    compressionMethod: 0,
    crc32: 0,
    dataEndOffset: 0,
    dataStartOffset: 0,
    directory: false,
    localHeaderOffset: 0,
    name,
    uncompressedSize,
  };
}

function forgeZipEntryUncompressedSize(archive: Uint8Array, size: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const centralOffset = findZipSignature(view, 0x02014b50);
  const localOffset = view.getUint32(centralOffset + 42, true);
  view.setUint32(localOffset + 22, size, true);
  view.setUint32(centralOffset + 24, size, true);
}

function findZipSignature(view: DataView, signature: number): number {
  for (let offset = 0; offset <= view.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error('Expected ZIP signature');
}
