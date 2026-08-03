import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { cloneCalloutPresetCatalog, serializeCalloutPresetCatalog } from './migration';

const MAX_CALLOUT_PRESET_SYNC_BYTES = 7_500;

export class CalloutPresetQuotaError extends Error {
  readonly code = 'quota';

  constructor() {
    super('Callout preset catalog exceeds the sync storage budget');
    this.name = 'CalloutPresetQuotaError';
  }
}

function getCalloutPresetStorageByteLength(storageKey: string, value: unknown): number {
  return new TextEncoder().encode(`${storageKey}${JSON.stringify(value)}`).byteLength;
}

export function createCalloutPresetWriteController(args: {
  cacheCatalog: (catalog: CalloutPresetCatalog) => void;
  storageKey: string;
}) {
  let writeQueue: Promise<void> = Promise.resolve();

  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const operation = writeQueue.catch(() => undefined).then(task);
    writeQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };

  const writeCatalog = async (
    catalog: CalloutPresetCatalog,
    permit: PersistenceMutationPermit
  ): Promise<void> => {
    const stored = serializeCalloutPresetCatalog(catalog);
    if (
      getCalloutPresetStorageByteLength(args.storageKey, stored) > MAX_CALLOUT_PRESET_SYNC_BYTES
    ) {
      throw new CalloutPresetQuotaError();
    }
    await browserStorage.sync.set({ [args.storageKey]: stored }, permit);
    args.cacheCatalog(cloneCalloutPresetCatalog(catalog));
  };

  return { enqueueWrite, writeCatalog };
}
