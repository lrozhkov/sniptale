import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ integrity: vi.fn() }));
vi.mock('./integrity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./integrity')>()),
  assertEffectBundleCatalogIntegrity: mocks.integrity,
}));

import { putEffectBundleBackupRestore } from './backup-restore';

const metadata = {
  createdAt: 1,
  description: { en: '', ru: '' },
  documents: [
    {
      assets: [],
      id: 'effect',
      kind: 'standalone' as const,
      schemaVersion: 'sniptale.effect.v1' as const,
      sha256: 'b'.repeat(64),
      source: '{}',
    },
  ],
  enabled: true,
  label: { en: 'Bundle', ru: 'Набор' },
  packId: 'bundle-one',
  retainedByteLength: 5,
  source: 'bundle-zip' as const,
  sourceSha256: 'c'.repeat(64),
  updatedAt: 2,
  version: '1',
};
const assets = [
  {
    blob: new Blob(['image'], { type: 'image/png' }),
    byteLength: 5,
    kind: 'image' as const,
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
  },
];

function store(existing?: unknown) {
  return {
    get: vi.fn().mockResolvedValue(existing),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

describe('effect bundle transaction-scoped backup restore', () => {
  it('puts a canonical restored entry without opening or completing a transaction', async () => {
    const target = store();
    await expect(
      putEffectBundleBackupRestore({ assets, entry: metadata, store: target, strategy: 'replace' })
    ).resolves.toEqual({ conflicted: false, imported: true, packId: 'bundle-one' });
    expect(target.put).toHaveBeenCalledWith(
      expect.objectContaining({ assets, packId: 'bundle-one' })
    );
  });

  it('supports skip and duplicate without overwriting the conflict', async () => {
    const existing = { ...metadata, assets };
    const skipped = store(existing);
    await expect(
      putEffectBundleBackupRestore({ assets, entry: metadata, store: skipped, strategy: 'skip' })
    ).resolves.toEqual({ conflicted: true, imported: false, packId: 'bundle-one' });
    expect(skipped.put).not.toHaveBeenCalled();

    const duplicated = store(existing);
    await expect(
      putEffectBundleBackupRestore({
        assets,
        createId: () => 'duplicate-id',
        entry: metadata,
        store: duplicated,
        strategy: 'duplicate',
      })
    ).resolves.toEqual({
      conflicted: true,
      imported: true,
      packId: 'bundle-one-duplicate-id',
    });
    expect(duplicated.put).toHaveBeenCalledWith(
      expect.objectContaining({ packId: 'bundle-one-duplicate-id' })
    );
  });
});
