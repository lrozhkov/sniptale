import type { BrowserStorageAreaAdapter } from '@sniptale/platform/browser/storage-types';
import type {
  ErasureParticipantResult,
  ErasureParticipantSeverity,
} from '@sniptale/runtime-contracts/privacy-erasure/types';
import type { ErasureParticipant } from './participant-types';

function createBrowserStorageParticipantResult(args: {
  id: string;
  remainingCount?: number;
  removedCount?: number;
  severity: ErasureParticipantSeverity;
  status: ErasureParticipantResult['status'];
}): ErasureParticipantResult {
  return {
    id: args.id,
    severity: args.severity,
    status: args.status,
    ...(args.remainingCount === undefined ? {} : { remainingCount: args.remainingCount }),
    ...(args.removedCount === undefined ? {} : { removedCount: args.removedCount }),
  };
}

async function removeBrowserStorageKeys(
  area: BrowserStorageAreaAdapter,
  keys: readonly string[],
  prefixes: readonly string[]
): Promise<string[]> {
  if ((keys.length === 0 && prefixes.length === 0) || !area.isAvailable()) {
    return [];
  }

  const prefixKeys =
    prefixes.length === 0
      ? []
      : Object.keys(await area.get(null)).filter((key) =>
          prefixes.some((prefix) => key.startsWith(prefix))
        );
  const keysToRemove = Array.from(new Set([...keys, ...prefixKeys]));
  if (keysToRemove.length === 0) {
    return [];
  }

  await area.remove(keysToRemove);
  return keysToRemove;
}

async function countBrowserStoragePlanRemaining(
  area: BrowserStorageAreaAdapter,
  keys: readonly string[],
  prefixes: readonly string[]
): Promise<number> {
  if (keys.length === 0 && prefixes.length === 0) {
    return 0;
  }
  if (!area.isAvailable()) {
    throw new Error('Browser storage area is unavailable');
  }

  const [directValues, allValues] = await Promise.all([
    keys.length === 0 ? Promise.resolve({}) : area.get([...keys]),
    prefixes.length === 0 ? Promise.resolve({}) : area.get(null),
  ]);
  const directRemaining = keys.filter((key) =>
    Object.prototype.hasOwnProperty.call(directValues, key)
  ).length;
  const prefixRemaining = Object.keys(allValues).filter((key) =>
    prefixes.some((prefix) => key.startsWith(prefix))
  ).length;
  return directRemaining + prefixRemaining;
}

export function createBrowserStorageParticipant(args: {
  area: BrowserStorageAreaAdapter;
  id: string;
  keys: readonly string[];
  prefixes: readonly string[];
  severity: ErasureParticipantSeverity;
}): ErasureParticipant {
  let removedKeys: string[] = [];
  return {
    getRemovedKeys: () => removedKeys,
    id: args.id,
    severity: args.severity,
    async erase() {
      removedKeys = await removeBrowserStorageKeys(args.area, args.keys, args.prefixes);
      return createBrowserStorageParticipantResult({
        id: args.id,
        removedCount: removedKeys.length,
        severity: args.severity,
        status: 'erased',
      });
    },
    async verifyEmpty() {
      const remainingCount = await countBrowserStoragePlanRemaining(
        args.area,
        args.keys,
        args.prefixes
      );
      return createBrowserStorageParticipantResult({
        id: args.id,
        remainingCount,
        severity: args.severity,
        status: remainingCount === 0 ? 'verified-empty' : 'failed',
      });
    },
  };
}
