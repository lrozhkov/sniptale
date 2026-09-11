import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { BuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
async function buildVideoEffectIndex(root: string): Promise<BuiltinEffectIndex> {
  const script =
    "import {buildVideoEffectIndex} from './apps/extension/build/video-effects.ts'; " +
    'console.log(JSON.stringify(await buildVideoEffectIndex(process.argv[1])));';
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script, root],
    { encoding: 'utf8' }
  );
  return JSON.parse(output);
}

import { createBuiltinEffectResources } from './builtin';
import { resolveCatalogDocument } from '../../../features/video/project/effect-bundle/catalog/resolution';
import { readVerifiedCatalogDocument } from '../../../features/video/project/effect-instance/catalog-reader';
import { overlayEffectPreferences } from './preferences';
const root = resolve('apps/extension/public/video-effects');
it('loads only the index, deduplicates requested documents, snapshots through the common verifier', async () => {
  const index = await buildVideoEffectIndex(root);
  const read = vi.fn(
    async (path: string) =>
      new Uint8Array(
        path === 'index.json'
          ? new TextEncoder().encode(JSON.stringify(index))
          : await readFile(resolve(root, path))
      )
  );
  const resource = createBuiltinEffectResources(read);
  const catalog = await resource.load();
  expect(read).toHaveBeenCalledTimes(1);
  expect(catalog.packId).toBe('builtin:sniptale-base');
  expect(catalog.documents.every((d) => d.source === undefined)).toBe(true);
  const id = catalog.documents[0]!.id;
  const [a, b] = await Promise.all([
    resolveCatalogDocument(catalog, id),
    resolveCatalogDocument(catalog, id),
  ]);
  expect(read).toHaveBeenCalledTimes(2);
  expect(a.documents).toEqual(b.documents);
  const verified = await readVerifiedCatalogDocument(catalog, id);
  expect(verified.document.id).toBe(id);
  expect(verified.catalogDocument.source).toBe(a.documents[0]!.source);
  expect(read).toHaveBeenCalledTimes(2);
  const preferences = [
    {
      packId: catalog.packId,
      enabled: false,
      documents: { [id]: { presets: [{ id: 'mine', name: 'Mine', values: { removed: 1 } }] } },
    },
  ];
  const updated = { ...catalog, version: '2.0.0' };
  expect(overlayEffectPreferences(updated, preferences)).toMatchObject({
    version: '2.0.0',
    enabled: false,
    documents: [
      expect.objectContaining({ presetPreferences: preferences[0]!.documents[id] }),
      ...updated.documents.slice(1),
    ],
  });
  expect(
    overlayEffectPreferences(
      { ...catalog, packId: 'sniptale-base', source: 'bundle-zip' },
      preferences
    ).enabled
  ).toBe(true);
});
it('retries failed reads without admitting corrupted documents', async () => {
  const index = await buildVideoEffectIndex(root);
  let broken = true;
  const resource = createBuiltinEffectResources(async (path) =>
    path === 'index.json'
      ? new TextEncoder().encode(JSON.stringify(index))
      : broken
        ? new TextEncoder().encode('{}')
        : new Uint8Array(await readFile(resolve(root, path)))
  );
  const catalog = await resource.load();
  const id = catalog.documents[0]!.id;
  await expect(resolveCatalogDocument(catalog, id)).rejects.toThrow('integrity');
  broken = false;
  await expect(resolveCatalogDocument(catalog, id)).resolves.toMatchObject({ documents: [{ id }] });
});

it('retains external assets in project snapshots independently of the installed collection', async () => {
  const { readValidBundleArtifact } = await import('./fixture.test-support');
  const { projectCatalogPresentation } =
    await import('../../../features/video/project/effect-bundle/catalog/presentation');
  const { applyEffectCatalogDocument } =
    await import('../../../features/video/project/effect-instance/apply');
  const { createEmptyVideoProject } =
    await import('../../../features/video/project/factories/creation');
  const artifact = await readValidBundleArtifact();
  const { sha256EffectV1Bytes } = await import('@sniptale/runtime-contracts/effect-v1');
  const shared = artifact.bundle.documents[0]!;
  const raw = JSON.parse(shared.source);
  raw.assets.push({ ...raw.assets[0], id: 'shared-mark', path: 'assets/shared-mark.svg' });
  raw.program.commands.push({ ...raw.program.commands[1], assetId: 'shared-mark' });
  shared.source = JSON.stringify(raw);
  artifact.bundle.manifest.assets.push({
    ...artifact.bundle.manifest.assets[0]!,
    path: 'assets/shared-mark.svg',
  });
  shared.assets.push({ ...shared.assets[0]!, id: 'shared-mark', path: 'assets/shared-mark.svg' });
  const encoded = new TextEncoder().encode(shared.source);
  artifact.bundle.manifest.effectDocuments[0]!.byteLength = encoded.length;
  artifact.bundle.manifest.effectDocuments[0]!.sha256 = await sha256EffectV1Bytes(encoded);
  const manifest = artifact.bundle.manifest;
  const index = {
    manifest,
    sourceSha256: artifact.bundle.archiveSha256,
    documents: artifact.bundle.documents.map((item) => ({
      id: item.document.id,
      kind: item.document.kind,
      presentation: projectCatalogPresentation(item.document),
    })),
  };
  const files = new Map<string, Uint8Array>([
    ['index.json', new TextEncoder().encode(JSON.stringify(index))],
  ]);
  for (const item of artifact.bundle.documents) {
    files.set(
      manifest.effectDocuments.find((d) => d.id === item.document.id)!.path,
      new TextEncoder().encode(item.source)
    );
    for (const asset of item.assets) if (asset.path) files.set(asset.path, asset.bytes);
  }
  const read = vi.fn(async (path: string) => {
    const bytes = files.get(path);
    if (!bytes) throw new Error('Missing resource');
    return bytes;
  });
  const catalog = await createBuiltinEffectResources(read).load();
  expect(read).toHaveBeenCalledTimes(1);
  const result = await applyEffectCatalogDocument({
    catalog,
    documentId: index.documents[0]!.id,
    instanceId: 'builtin-asset',
    project: createEmptyVideoProject('offline'),
    startTime: 0,
    target: { kind: 'scene' },
  });
  const snapshot = JSON.stringify(result);
  expect(snapshot).toContain('builtin:');
  expect(snapshot).toContain(manifest.assets[0]!.sha256);
  files.clear();
  expect(JSON.stringify(result)).toBe(snapshot);
  expect(read.mock.calls.filter(([path]) => path === manifest.assets[0]!.path)).toHaveLength(1);
});

it('projects full imported metadata and rejects unknown lazy document requests', async () => {
  const { readCatalogPresentation, projectCatalogPresentation } =
    await import('../../../features/video/project/effect-bundle/catalog/presentation');
  const { parseEffectV1Source } = await import('@sniptale/runtime-contracts/effect-v1');
  const index = await buildVideoEffectIndex(root);
  const source = await readFile(resolve(root, index.manifest.effectDocuments[0]!.path), 'utf8');
  const document = parseEffectV1Source(source).document!;
  expect(readCatalogPresentation({ source })).toMatchObject({ label: document.label });
  expect(readCatalogPresentation({})).toBeUndefined();
  expect(projectCatalogPresentation(document).controlPresets).toHaveLength(
    document.controlPresets!.length
  );
  const resources = createBuiltinEffectResources(async () =>
    new TextEncoder().encode(JSON.stringify(index))
  );
  await expect(resolveCatalogDocument(await resources.load(), 'missing')).rejects.toThrow(
    'Unknown builtin effect'
  );
});
