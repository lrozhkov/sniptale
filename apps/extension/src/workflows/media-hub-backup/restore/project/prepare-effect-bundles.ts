import {
  EFFECT_BUNDLE_CATALOG_RETAINED_BYTES_LIMIT,
  getEffectBundle,
  listEffectBundles,
} from '../../../../composition/persistence/effect-bundles';
import type { EffectBundleCatalogEntry } from '../../../../features/video/project/effect-bundle/catalog';
import type {
  EffectBundleBackupDescriptor,
  MediaHubBackupMetadata,
  MediaHubImportConflictStrategy,
} from '../../contracts/types';

export interface PreparedEffectBundle {
  descriptor: EffectBundleBackupDescriptor;
  packId: string;
  replace?: boolean;
  restoredEntry?: EffectBundleCatalogEntry;
}

interface PreparedEffectBundleSet {
  changedIds: string[];
  conflictsResolved: number;
  prepared: PreparedEffectBundle[];
  skipped: number;
}

export async function prepareEffectBundles(args: {
  metadata: MediaHubBackupMetadata;
  strategy: MediaHubImportConflictStrategy;
}): Promise<PreparedEffectBundleSet> {
  if (args.metadata.effectBundles.length === 0) {
    return { changedIds: [], conflictsResolved: 0, prepared: [], skipped: 0 };
  }
  const retainedByPackId = await loadRetainedEffectBundleBytes();
  const reservedPackIds = new Set(retainedByPackId.keys());
  let retainedBytes = [...retainedByPackId.values()].reduce((total, bytes) => total + bytes, 0);
  const prepared: PreparedEffectBundle[] = [];
  const changedIds: string[] = [];
  let conflictsResolved = 0;
  let skipped = 0;
  for (const descriptor of args.metadata.effectBundles) {
    const existing = await getEffectBundle(descriptor.entry.packId);
    if (existing && args.strategy === 'skip') {
      skipped += 1;
      continue;
    }
    const packId = resolveRestoredEffectBundleId(
      descriptor,
      existing,
      args.strategy,
      reservedPackIds
    );
    reservedPackIds.add(packId);
    retainedBytes =
      retainedBytes -
      (existing && args.strategy === 'replace' ? existing.retainedByteLength : 0) +
      descriptor.entry.retainedByteLength;
    if (retainedBytes > EFFECT_BUNDLE_CATALOG_RETAINED_BYTES_LIMIT) {
      throw new Error('EffectV1 catalog restore exceeds the retained byte limit.');
    }
    prepared.push({
      descriptor,
      packId,
      replace: Boolean(existing && args.strategy === 'replace'),
    });
    changedIds.push(`effect-bundle:${packId}`);
    if (existing) conflictsResolved += 1;
  }
  return { changedIds, conflictsResolved, prepared, skipped };
}

async function loadRetainedEffectBundleBytes(): Promise<Map<string, number>> {
  const catalog = await listEffectBundles();
  if (catalog.some(({ status }) => status === 'invalid')) {
    throw new Error('Existing EffectV1 catalog contains an invalid entry.');
  }
  return new Map(
    catalog.flatMap((item) =>
      item.status === 'ready' ? [[item.packId, item.retainedByteLength] as const] : []
    )
  );
}

function resolveRestoredEffectBundleId(
  descriptor: EffectBundleBackupDescriptor,
  existing: EffectBundleCatalogEntry | null,
  strategy: MediaHubImportConflictStrategy,
  reservedPackIds: ReadonlySet<string>
): string {
  if (!existing || strategy !== 'duplicate') return descriptor.entry.packId;
  return createDuplicateEffectBundleId(descriptor.entry.sourceSha256, reservedPackIds);
}

function createDuplicateEffectBundleId(
  sourceSha256: string,
  reservedPackIds: ReadonlySet<string>
): string {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nonce = crypto
      .randomUUID()
      .replace(/[^A-Za-z0-9]/gu, '')
      .slice(0, 32);
    const candidate = `backup.${sourceSha256.slice(0, 12)}.${nonce}`;
    if (!reservedPackIds.has(candidate)) return candidate;
  }
  throw new Error('Unable to allocate a collision-free EffectV1 catalog id.');
}
