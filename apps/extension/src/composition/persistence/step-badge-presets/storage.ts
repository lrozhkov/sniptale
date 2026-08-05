import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { cloneStepBadgePresetCatalog, serializeStepBadgePresetCatalog } from './migration';

const MAX_STEP_BADGE_PRESET_SYNC_BYTES = 7_500;

export class StepBadgePresetQuotaError extends Error {
  readonly code = 'quota';
}

export function createStepBadgePresetWriteController(args: {
  cache: (catalog: StepBadgePresetCatalog) => void;
  storageKey: string;
}) {
  let queue: Promise<void> = Promise.resolve();
  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const operation = queue.catch(() => undefined).then(task);
    queue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };
  const writeCatalog = async (
    catalog: StepBadgePresetCatalog,
    permit: PersistenceMutationPermit
  ) => {
    const stored = serializeStepBadgePresetCatalog(catalog);
    const bytes = new TextEncoder().encode(
      `${args.storageKey}${JSON.stringify(stored)}`
    ).byteLength;
    if (bytes > MAX_STEP_BADGE_PRESET_SYNC_BYTES) throw new StepBadgePresetQuotaError();
    await browserStorage.sync.set({ [args.storageKey]: stored }, permit);
    args.cache(cloneStepBadgePresetCatalog(catalog));
  };
  return { enqueueWrite, writeCatalog };
}
