import { hasExactKeys, isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parsePersistedVideoProjectHistory,
  type PersistedVideoProjectHistory,
} from '../../../../composition/persistence/projects/history-contracts';
import type { VideoProjectHistorySourceReference } from '../../../../features/video/project/history-capture';
import { EDITOR_HISTORY_LIMITS } from '../../../../features/editor-history/policy';

/** Portable references identify archive objects, never native immutable files or publication epochs. */
export interface PortableVideoProjectHistory {
  version: 1;
  past: readonly { objectId: string }[];
  future: readonly { objectId: string }[];
  recovery?: { objectId: string };
  sources: readonly VideoProjectHistorySourceReference[];
}

function invalid(): never {
  throw new Error('Portable video project history is invalid.');
}

function changePointers(value: unknown): { assetId: string }[] {
  if (!Array.isArray(value) || value.length > EDITOR_HISTORY_LIMITS.maxActions) return invalid();
  return value.map((entry) => {
    if (
      !isPlainRecord(entry) ||
      !hasExactKeys(entry, ['objectId']) ||
      typeof entry['objectId'] !== 'string'
    )
      return invalid();
    return { assetId: entry['objectId'] };
  });
}

/** Admit the same bounded branches and logical sources as the native history contract. */
export function parsePortableVideoProjectHistory(value: unknown): PortableVideoProjectHistory {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'version',
      'past',
      'future',
      'sources',
      ...(value['recovery'] === undefined ? [] : ['recovery']),
    ])
  )
    return invalid();
  const parsed = parsePersistedVideoProjectHistory({
    version: value['version'],
    epoch: 'archive',
    past: changePointers(value['past']),
    future: changePointers(value['future']),
    sources: value['sources'],
    ...(value['recovery'] === undefined
      ? {}
      : { recovery: changePointers([value['recovery']])[0] }),
  });
  if (!parsed) return invalid();
  return encodePortableVideoProjectHistory(
    parsed,
    new Map(
      [...parsed.past, ...parsed.future, ...(parsed.recovery ? [parsed.recovery] : [])].map(
        ({ assetId }) => [assetId, assetId]
      )
    )
  );
}

/** Keep each direction's order while replacing native backing identities with typed object pointers. */
export function encodePortableVideoProjectHistory(
  history: PersistedVideoProjectHistory,
  objectsByAssetId: ReadonlyMap<string, string>
): PortableVideoProjectHistory {
  const pointer = ({ assetId }: { assetId: string }) => {
    const objectId = objectsByAssetId.get(assetId);
    if (!objectId) return invalid();
    return { objectId };
  };
  return {
    version: 1,
    past: history.past.map(pointer),
    future: history.future.map(pointer),
    ...(history.recovery ? { recovery: pointer(history.recovery) } : {}),
    sources: history.sources,
  };
}

/** A new native epoch belongs to this restore attempt; only validated file bindings are supplied. */
export function decodePortableVideoProjectHistory(
  history: PortableVideoProjectHistory,
  assetsByObjectId: ReadonlyMap<string, string>,
  epoch: string,
  sources: readonly VideoProjectHistorySourceReference[] = history.sources
): PersistedVideoProjectHistory {
  const pointer = ({ objectId }: { objectId: string }) => {
    const assetId = assetsByObjectId.get(objectId);
    if (!assetId) return invalid();
    return { assetId };
  };
  const parsed = parsePersistedVideoProjectHistory({
    version: 1,
    epoch,
    sources,
    past: history.past.map(pointer),
    future: history.future.map(pointer),
    ...(history.recovery ? { recovery: pointer(history.recovery) } : {}),
  });
  return parsed ?? invalid();
}

/** Logical references count repeated actions even when immutable bodies are shared. */
export function portableVideoProjectHistoryPointers(
  history: PortableVideoProjectHistory
): readonly { objectId: string }[] {
  return [...history.past, ...history.future, ...(history.recovery ? [history.recovery] : [])];
}
