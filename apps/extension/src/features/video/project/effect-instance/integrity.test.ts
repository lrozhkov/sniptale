import { describe, expect, it } from 'vitest';

import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../effect-bundle/import/zip';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProject } from '../types';
import type { VideoProjectEffectSnapshot } from './types';
import { verifyVideoProjectEffectSnapshotIntegrity } from './integrity';

describe('project-owned EffectV1 snapshot integrity', () => {
  it('accepts the byte-identical document and asset closure', async () => {
    await expect(
      verifyVideoProjectEffectSnapshotIntegrity(await createProjectWithAssetSnapshot())
    ).resolves.toBeUndefined();
  });

  it('rejects source digest, parsing, and document identity drift', async () => {
    const project = await createProjectWithAssetSnapshot();
    const snapshot = project.effectSnapshots![0]!;

    await expectIntegrityFailure(project, { ...snapshot, sha256: '0'.repeat(64) });
    const malformedSource = '{}';
    await expectIntegrityFailure(project, {
      ...snapshot,
      sha256: await hashText(malformedSource),
      source: malformedSource,
    });
    await expectIntegrityFailure(project, { ...snapshot, documentId: 'different-document' });
  });

  it('rejects missing, duplicate, and mismatched asset metadata', async () => {
    const project = await createProjectWithAssetSnapshot();
    const snapshot = project.effectSnapshots![0]!;
    const asset = snapshot.assets[0]!;

    await expectIntegrityFailure(project, { ...snapshot, assets: [] });
    await expectIntegrityFailure(project, { ...snapshot, assets: [asset, asset] });
    await expectIntegrityFailure(project, {
      ...snapshot,
      assets: [{ ...asset, mimeType: 'image/jpeg' }],
    });
  });
});

describe('project-owned EffectV1 snapshot byte integrity', () => {
  it('rejects changed retained bytes before browser decoding', async () => {
    const project = await createProjectWithAssetSnapshot();
    const snapshot = project.effectSnapshots![0]!;
    const asset = snapshot.assets[0]!;
    const truncated = new Uint8Array((await asset.blob.arrayBuffer()).slice(0, -1));

    await expectIntegrityFailure(project, {
      ...snapshot,
      assets: [{ ...asset, blob: new Blob([truncated], { type: asset.mimeType }) }],
    });
    const changed = new Uint8Array(await asset.blob.arrayBuffer());
    changed[changed.length - 1] = changed[changed.length - 1] === 0 ? 1 : 0;
    await expectIntegrityFailure(project, {
      ...snapshot,
      assets: [{ ...asset, blob: new Blob([changed], { type: asset.mimeType }) }],
    });
  });

  it('rejects matching hashes whose bytes violate the declared MIME signature', async () => {
    const project = await createProjectWithAssetSnapshot();
    const snapshot = project.effectSnapshots![0]!;
    const invalidBytes = Uint8Array.from({ length: snapshot.assets[0]!.byteLength }, () => 1);
    const invalidHash = await sha256EffectV1Bytes(invalidBytes);
    const validation = validateEffectV1Document(JSON.parse(snapshot.source));
    if (!validation.document) throw new Error('Expected valid EffectV1 snapshot');
    const document = structuredClone(validation.document);
    document.assets[0]!.sha256 = invalidHash;
    const source = JSON.stringify(document);
    const asset = {
      ...snapshot.assets[0]!,
      blob: new Blob([invalidBytes], { type: snapshot.assets[0]!.mimeType }),
      sha256: invalidHash,
    };

    await expectIntegrityFailure(project, {
      ...snapshot,
      assets: [asset],
      retainedByteLength: new TextEncoder().encode(source).byteLength + asset.byteLength,
      sha256: await hashText(source),
      source,
    });
  });
});

async function createProjectWithAssetSnapshot(): Promise<VideoProject> {
  const corpusCase = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  )!;
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpusCase));
  if (!imported.ok) throw new Error('Expected asset-bearing EffectV1 corpus fixture');
  const document = imported.bundle.documents[0]!;
  const snapshot: VideoProjectEffectSnapshot = {
    assets: document.assets.map((asset) => ({
      blob: new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.mimeType }),
      byteLength: asset.byteLength,
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
    })),
    documentId: document.document.id,
    id: `effect:${document.sha256}`,
    kind: document.document.kind,
    retainedByteLength:
      new TextEncoder().encode(document.source).byteLength +
      document.assets.reduce((total, asset) => total + asset.byteLength, 0),
    schemaVersion: 'sniptale.effect.v1',
    sha256: document.sha256,
    source: document.source,
  };
  return { ...createEmptyVideoProject('integrity'), effectSnapshots: [snapshot] };
}

async function expectIntegrityFailure(
  project: VideoProject,
  snapshot: VideoProjectEffectSnapshot
): Promise<void> {
  await expect(
    verifyVideoProjectEffectSnapshotIntegrity({ ...project, effectSnapshots: [snapshot] })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectSnapshotIntegrityFailure' }));
}

async function hashText(value: string): Promise<string> {
  return sha256EffectV1Bytes(new TextEncoder().encode(value));
}
