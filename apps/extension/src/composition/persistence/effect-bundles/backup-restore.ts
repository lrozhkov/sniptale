import type { ArchiveRestoreStrategy } from '../assets';
import { parseEffectBundleCatalogEntry } from './entry';
import { assertEffectBundleCatalogIntegrity } from './integrity';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';

interface EffectBundleRestoreStore {
  get(packId: string): Promise<unknown>;
  put(entry: EffectBundleCatalogEntry): Promise<unknown>;
}

interface PortableEffectBundleRestoreAsset {
  blob: Blob;
  byteLength: number;
  kind: 'audio' | 'image' | 'svg';
  mimeType: string;
  sha256: string;
}

function duplicatePackId(packId: string, createId: () => string): string {
  const suffix = createId()
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 24);
  const prefix = packId.slice(0, Math.max(1, 127 - suffix.length));
  return `${prefix}-${suffix}`;
}

export async function putEffectBundleBackupRestore(args: {
  assets: PortableEffectBundleRestoreAsset[];
  createId?: () => string;
  entry: Omit<EffectBundleCatalogEntry, 'assets'>;
  store: EffectBundleRestoreStore;
  strategy: ArchiveRestoreStrategy;
}): Promise<{ conflicted: boolean; imported: boolean; packId: string }> {
  const existing = parseEffectBundleCatalogEntry(await args.store.get(args.entry.packId));
  if (existing && args.strategy === 'skip') {
    return { conflicted: true, imported: false, packId: existing.packId };
  }
  const createId =
    args.createId ??
    (() => {
      if (typeof crypto.randomUUID !== 'function') {
        throw new Error('Secure effect bundle restore IDs are unavailable.');
      }
      return crypto.randomUUID();
    });
  const packId =
    existing && args.strategy === 'duplicate'
      ? duplicatePackId(args.entry.packId, createId)
      : args.entry.packId;
  const candidate = parseEffectBundleCatalogEntry({
    ...args.entry,
    assets: args.assets,
    packId,
  });
  if (!candidate) throw new Error('Restored effect bundle catalog is invalid.');
  await assertEffectBundleCatalogIntegrity(candidate);
  await args.store.put(candidate);
  return { conflicted: existing !== null, imported: true, packId };
}
