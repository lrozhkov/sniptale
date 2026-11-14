import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, expect, it, vi } from 'vitest';
import { buildVideoEffectIndex } from './fixture.test-support';
import type { BuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
import { createBuiltinEffectResources } from './builtin';
import { resolveCatalogDocument } from '../../../features/video/project/effect-bundle/catalog/resolution';
import { readVerifiedCatalogDocument } from '../../../features/video/project/effect-instance/catalog-reader';
import { overlayVisualAnimationPreferences } from './preferences';
const root = resolve('apps/extension/public/video-effects');
let index: BuiltinEffectIndex;
beforeAll(async () => {
  index = await buildVideoEffectIndex(root);
});
it('loads only the index, deduplicates requested documents, snapshots through the common verifier', async () => {
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
  expect(catalog.packId).toBe('builtin:sniptale-animations');
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
  const oneDisabled = {
    ...catalog,
    documents: catalog.documents.map((document) => ({ ...document, enabled: document.id !== id })),
  };
  await expect(resolveCatalogDocument(oneDisabled, id)).resolves.toMatchObject({
    enabled: true,
    documents: [{ id, enabled: false }],
  });
  const preferences = [
    {
      format: 'sniptale-visual-preferences' as const,
      version: 1 as const,
      kind: 'animation' as const,
      packId: catalog.packId,
      documents: {
        [id]: {
          sourceSha256: catalog.documents[0]!.sha256,
          enabled: false,
          presetPreferences: { presets: [{ id: 'mine', name: 'Mine', values: { removed: 1 } }] },
        },
      },
    },
  ];
  const updated = { ...catalog, version: '2.0.0' };
  expect(overlayVisualAnimationPreferences(updated, preferences).documents[0]).toMatchObject({
    enabled: false,
    presetPreferences: preferences[0]!.documents[id]!.presetPreferences,
  });
  expect(
    overlayVisualAnimationPreferences({ ...catalog, packId: 'other' }, preferences).documents.every(
      (document) => document.enabled
    )
  ).toBe(true);
});
it('retries failed reads without admitting corrupted documents', async () => {
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

it('retains embedded resources in project snapshots independently of the installed collection', async () => {
  const { applyEffectCatalogDocument } =
    await import('../../../features/video/project/effect-instance/apply');
  const { createEmptyVideoProject } =
    await import('../../../features/video/project/factories/creation');
  const { resolveEffectRuntimeFramePlans } =
    await import('../../../features/video/composition/effect-runtime/frame/plan');
  let available = true;
  const read = vi.fn(async (path: string) => {
    if (!available) throw new Error('Collection removed');
    return new Uint8Array(
      path === 'index.json'
        ? new TextEncoder().encode(JSON.stringify(index))
        : await readFile(resolve(root, path))
    );
  });
  const catalog = await createBuiltinEffectResources(read).load();
  const project = await applyEffectCatalogDocument({
    catalog,
    documentId: 'sniptale-leader-labels',
    instanceId: 'builtin-resource',
    project: createEmptyVideoProject('offline'),
    startTime: 0,
    target: { kind: 'scene' },
  });
  const retained = JSON.stringify(project);
  expect(retained).toContain('builtin:');
  expect(retained).toContain('929b0c4c13cffa9fff0a42cc5f014eb0c051a1cb8e212ca88b356d44c09ecb31');
  expect(project.effectSnapshots![0]!.assets).toEqual([]);
  available = false;
  expect(JSON.stringify(project)).toBe(retained);
  expect(resolveEffectRuntimeFramePlans(project, 0.5)).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls.some(([path]) => path.startsWith('fonts/'))).toBe(false);
});

it('projects full imported metadata and rejects unknown lazy document requests', async () => {
  const { readCatalogPresentation, projectCatalogPresentation } =
    await import('../../../features/video/project/effect-bundle/catalog/presentation');
  const { parseAnimationTemplateSource } =
    await import('@sniptale/runtime-contracts/animation-template');
  const source = await readFile(resolve(root, index.manifest.documents[0]!.path), 'utf8');
  const document = parseAnimationTemplateSource(source).template!;
  expect(readCatalogPresentation({ source })).toMatchObject({ label: document.label });
  expect(readCatalogPresentation({})).toBeUndefined();
  expect(projectCatalogPresentation(document).controlPresets).toHaveLength(
    document.controlPresets!.length
  );
  const resources = createBuiltinEffectResources(async () =>
    new TextEncoder().encode(JSON.stringify(index))
  );
  await expect(resolveCatalogDocument(await resources.load(), 'missing')).rejects.toThrow(
    'Unknown builtin animation'
  );
});
