vi.mock('./preferences', async (original) => ({
  ...(await original<typeof import('./preferences')>()),
  readEffectCatalogPreferences: async () => [],
  writeEffectCatalogPreferences: async () => {},
}));
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { expect, it, vi } from 'vitest';
import { createEffectCatalogEntry } from './catalog-builder';
import { readValidBundleArtifact } from './fixture.test-support';
import { assertEffectBundleCatalogIntegrity } from './integrity';
import {
  encodeEffectSettingsEntry,
  decodeEffectSettingsEntry,
  prepareEffectSettingsMutation,
} from './settings-transfer';
import { buildSettingsTransferPackage } from '../../../workflows/settings-transfer/package';
import { buildSettingsTransferTree } from '../../../workflows/settings-transfer/tree';
import { planSettingsTransfer } from '../../../workflows/settings-transfer/planner';
import {
  cloneSettingsTransferJsonValue,
  parseSettingsTransferPackageText,
} from '../../../contracts/settings-transfer';

it('roundtrips effect documents, binary assets and enabled state through full and selective JSON', async () => {
  const entry = {
    ...(await createEffectCatalogEntry(await readValidBundleArtifact(), 123)),
    enabled: false,
  };
  const portable = await encodeEffectSettingsEntry(entry);
  const other = { ...portable, id: 'other', packId: 'other' };
  const domains = {
    'styles.video-effects': {
      schemaVersion: 1,
      data: cloneSettingsTransferJsonValue({ items: [portable, other] }),
    },
  };
  const tree = buildSettingsTransferTree(
    [portable, other].map((item) => ({
      collectionNodeId: 'styles.video-effects.items',
      id: item.id,
      label: item.name,
    }))
  );
  for (const exportKind of ['backup', 'selective'] as const) {
    const result = buildSettingsTransferPackage({
      appVersion: '1',
      domains,
      tree,
      exportKind,
      selectedNodeIds: [`styles.video-effects.items.${portable.id}`],
    });
    const decoded = parseSettingsTransferPackageText(result.fileText);
    const data = decoded.domains['styles.video-effects']!.data;
    expect(data).toEqual({ items: exportKind === 'backup' ? [portable, other] : [portable] });
    const restored = decodeEffectSettingsEntry(portable);
    expect(restored.enabled).toBe(false);
    expect(restored.documents).toEqual(entry.documents);
    expect(await restored.assets[0]!.blob.arrayBuffer()).toEqual(
      await entry.assets[0]!.blob.arrayBuffer()
    );
    await expect(assertEffectBundleCatalogIntegrity(restored)).resolves.toBeUndefined();
  }
});

it('preserves safe-merge copies as distinct packs and rejects damaged assets', async () => {
  const portable = await encodeEffectSettingsEntry(
    await createEffectCatalogEntry(await readValidBundleArtifact(), 123)
  );
  const domain = (item: unknown) => ({
    'styles.video-effects': {
      schemaVersion: 1,
      data: cloneSettingsTransferJsonValue({ items: [item] }),
    },
  });
  const plan = planSettingsTransfer({
    current: domain(portable),
    imported: domain({ ...portable, enabled: false }),
    strategy: 'safe-merge',
  });
  const data = plan.domains['styles.video-effects']!.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data['items']))
    throw new Error('Missing planned items');
  const entries = data['items'].map(decodeEffectSettingsEntry);
  expect(entries).toHaveLength(2);
  expect(entries[0]!.packId).not.toBe(entries[1]!.packId);
  expect(entries[1]!.enabled).toBe(false);
  expect(() =>
    decodeEffectSettingsEntry({ ...portable, assets: [{ ...portable.assets[0], base64: '%%%' }] })
  ).toThrow();
  const corrupted = decodeEffectSettingsEntry({
    ...portable,
    assets: portable.assets.map((asset) => ({ ...asset, sha256: '0'.repeat(64) })),
  });
  await expect(assertEffectBundleCatalogIntegrity(corrupted)).rejects.toThrow();
});

const storeMocks = vi.hoisted(() => ({
  getAll: vi.fn(async () => []),
  clear: vi.fn(async () => {}),
  put: vi.fn(async (_value: unknown) => {}),
  abort: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', () => ({
  VIDEO_EFFECT_BUNDLES_STORE: 'video_effect_bundles',
  initDB: async () => ({
    getAll: storeMocks.getAll,
    transaction: () => ({
      store: { clear: storeMocks.clear, put: storeMocks.put },
      done: Promise.resolve(),
      abort: storeMocks.abort,
    }),
  }),
}));

it('requires a live mutation permit, restores atomically and propagates failed writes', async () => {
  const entry = await encodeEffectSettingsEntry(
    await createEffectCatalogEntry(await readValidBundleArtifact(), 1)
  );
  await expect(prepareEffectSettingsMutation({ items: [entry] })).rejects.toThrow('permit');
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    const plan = await prepareEffectSettingsMutation({ items: [entry] }, permit);
    await plan.commit();
    expect(storeMocks.put).toHaveBeenCalledWith(expect.objectContaining({ packId: entry.id }));
    storeMocks.put.mockRejectedValueOnce(new Error('quota'));
    await expect(plan.commit()).rejects.toThrow('quota');
    expect(storeMocks.abort).toHaveBeenCalled();
    await plan.rollback();
  });
});

it('keeps presets attached to imported copies and preserves unrelated builtin preferences', async () => {
  const portable = await encodeEffectSettingsEntry(
    await createEffectCatalogEntry(await readValidBundleArtifact(), 1)
  );
  const local = { packId: 'builtin:base', enabled: false, documents: {} };
  const importedPreference = {
    packId: portable.id,
    documentEnabled: { missing: false },
    documents: { missing: { presets: [] } },
  };
  const domain = (item: unknown, preferences: unknown[]) => ({
    'styles.video-effects': {
      schemaVersion: 1,
      data: cloneSettingsTransferJsonValue({ items: [item], preferences }),
    },
  });
  const plan = planSettingsTransfer({
    current: domain(portable, [local]),
    imported: domain({ ...portable, enabled: false }, [importedPreference]),
    strategy: 'safe-merge',
  });
  const data = plan.domains['styles.video-effects']!.data as {
    items: { id: string }[];
    preferences: { packId: string }[];
  };
  expect(data.preferences).toContainEqual(local);
  expect(data.preferences).toContainEqual({ ...importedPreference, packId: data.items[1]!.id });
});

it('merges preference inventories by source identity with one explicit conflict decision', () => {
  const row = (packId: string, enabled: boolean) => ({ packId, enabled, documents: {} });
  const a = row('builtin:base', false),
    b = row('another', false),
    same = row('unchanged', true);
  const domain = (preferences: unknown[]) => ({
    'styles.video-effects': {
      schemaVersion: 1,
      data: cloneSettingsTransferJsonValue({ items: [], preferences }),
    },
  });
  for (const decision of ['keep-local', 'use-imported'] as const) {
    const plan = planSettingsTransfer({
      current: domain([a, b, same]),
      imported: domain([row(a.packId, true), row(b.packId, true), same]),
      strategy: 'safe-merge',
      decisions: { 'styles.video-effects.preferences': decision },
    });
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.domains['styles.video-effects']!.data).toEqual({
      items: [],
      preferences:
        decision === 'keep-local' ? [a, b, same] : [row(a.packId, true), row(b.packId, true), same],
    });
  }
});
