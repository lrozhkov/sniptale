import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { importAnimationArtifactBytes } from '../effect-bundle/lottie-profile';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProject } from '../types';
import { applyEffectCatalogDocument } from './apply';

function hashText(source: string) {
  return createHash('sha256').update(source).digest('hex');
}
async function createRawCatalog(source: string): Promise<EffectBundleCatalogEntry> {
  const imported = await importAnimationArtifactBytes(new TextEncoder().encode(source));
  if (!imported.ok) throw new Error('Expected valid animation fixture.');
  const entry = imported.documents[0]!,
    document = entry.template;
  return {
    assets: [],
    createdAt: 1,
    updatedAt: 1,
    enabled: true,
    description: { en: '', ru: '' },
    label: { en: document.label.en, ru: document.label.ru ?? document.label.en },
    documents: [
      {
        assets: [],
        id: document.id,
        kind: 'standalone',
        schemaVersion: 'sniptale.animation.v1',
        sha256: entry.sha256,
        source: entry.source,
      },
    ],
    packId: `animation.${document.id}`,
    retainedByteLength: new TextEncoder().encode(entry.source).byteLength,
    source: 'raw-json',
    sourceSha256: imported.archiveSha256,
    version: '1',
  };
}
function readFixture(): string {
  return readFileSync(
    'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
    'utf8'
  );
}

function createApplyArgs(catalog: EffectBundleCatalogEntry, project: VideoProject) {
  return {
    catalog,
    documentId: catalog.documents[0]!.id,
    instanceId: 'effect-instance',
    project,
    startTime: 0,
    target: { kind: 'scene' as const },
  };
}
async function expectApplyFailure(
  catalog: EffectBundleCatalogEntry,
  project: VideoProject,
  code = 'effectCatalogIntegrityFailure'
) {
  const before = structuredClone(project);
  await expect(applyEffectCatalogDocument(createApplyArgs(catalog, project))).rejects.toMatchObject(
    { code }
  );
  expect(project).toEqual(before);
}
function replaceSource(
  catalog: EffectBundleCatalogEntry,
  source: string
): EffectBundleCatalogEntry {
  return {
    ...catalog,
    retainedByteLength: Buffer.byteLength(source),
    documents: [{ ...catalog.documents[0]!, source, sha256: hashText(source) }],
  };
}

describe('self-contained animation catalog apply integrity', () => {
  it('rejects missing, changed, malformed, and identity-mismatched catalog documents', async () => {
    const catalog = await createRawCatalog(readFixture()),
      project = createEmptyVideoProject('apply');
    await expect(
      applyEffectCatalogDocument({ ...createApplyArgs(catalog, project), documentId: 'missing' })
    ).rejects.toMatchObject({ code: 'effectCatalogIntegrityFailure' });
    await expectApplyFailure(
      { ...catalog, documents: [{ ...catalog.documents[0]!, sha256: '0'.repeat(64) }] },
      project
    );
    await expectApplyFailure(replaceSource(catalog, '{}'), project);
    await expectApplyFailure(
      { ...catalog, documents: [{ ...catalog.documents[0]!, id: 'catalog-alias' }] },
      project
    );
  });
  it('copies the verified self-contained font resources into an immutable source snapshot', async () => {
    const catalog = await createRawCatalog(readFixture()),
      project = createEmptyVideoProject('resources');
    const source = catalog.documents[0]!.source!;
    expect(
      JSON.parse(source).resources.some(
        (entry: { mimeType: string }) => entry.mimeType === 'font/ttf'
      )
    ).toBe(true);
    const applied = await applyEffectCatalogDocument(createApplyArgs(catalog, project));
    expect(applied.effectSnapshots).toEqual([
      expect.objectContaining({
        source,
        assets: [],
        retainedByteLength: Buffer.byteLength(source),
      }),
    ]);
    expect(project.effectSnapshots).toEqual([]);
  });
  it('rejects package resource closure, byte, digest, MIME, and retained-size tampering', async () => {
    const catalog = await createRawCatalog(readFixture()),
      project = createEmptyVideoProject('resources');
    for (const change of ['missing', 'duplicate', 'path', 'digest', 'bytes', 'mime'] as const) {
      const document = JSON.parse(catalog.documents[0]!.source!);
      const resource = document.resources[0];
      if (change === 'missing') document.resources = [];
      if (change === 'duplicate') document.resources.push(structuredClone(resource));
      if (change === 'path') resource.path = 'fonts/swapped.ttf';
      if (change === 'digest') resource.sha256 = '0'.repeat(64);
      if (change === 'bytes') {
        const bytes = Buffer.from(resource.base64, 'base64');
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
        resource.base64 = bytes.toString('base64');
      }
      if (change === 'mime') resource.mimeType = 'image/png';
      await expectApplyFailure(replaceSource(catalog, JSON.stringify(document)), project);
    }
    await expectApplyFailure(
      { ...catalog, retainedByteLength: catalog.retainedByteLength + 1 },
      project
    );
    await expectApplyFailure(
      { ...catalog, documents: [...catalog.documents, catalog.documents[0]!] },
      project
    );
  });
});

describe('project snapshot apply integrity', () => {
  it('rejects snapshot id collisions and project retained-byte amplification', async () => {
    const catalog = await createRawCatalog(readFixture()),
      original = createEmptyVideoProject('snapshot');
    const applied = await applyEffectCatalogDocument(createApplyArgs(catalog, original)),
      snapshot = applied.effectSnapshots![0]!;
    await expectApplyFailure(catalog, {
      ...applied,
      effectSnapshots: [{ ...snapshot, source: `${snapshot.source}\n` }],
    });
    await expectApplyFailure(
      catalog,
      {
        ...original,
        effectSnapshots: [
          {
            ...snapshot,
            id: `effect:${'f'.repeat(64)}`,
            retainedByteLength: 512 * 1024 * 1024,
            sha256: 'f'.repeat(64),
          },
        ],
      },
      'effectProjectQuotaExceeded'
    );
  });
});
