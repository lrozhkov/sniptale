import type {
  StepBadgePreset,
  StepBadgePresetCatalog,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { createLogger } from '@sniptale/platform/observability/logger';
import { SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION } from '../../../features/highlighter/step-badge-presets/catalog';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import {
  cloneStepBadgePresetCatalog,
  resolveStoredStepBadgePresetCatalog,
  serializeStepBadgePresetCatalog,
} from './migration';
import {
  addStepBadgePreset,
  deleteStepBadgePreset,
  reorderStepBadgePresets,
  resetSystemStepBadgePreset,
  setDefaultStepBadgePreset,
  setStepBadgePresetEnabled,
  updateStepBadgePreset,
} from './mutations';
import {
  MAX_STEP_BADGE_PRESET_NAME_LENGTH,
  MAX_USER_STEP_BADGE_PRESETS,
  parseStepBadgeTemplateSettings,
  parseStoredStepBadgePresetCatalog,
  STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION,
} from './parser';
import { createStepBadgePresetWriteController, StepBadgePresetQuotaError } from './storage';

export const STEP_BADGE_PRESETS_STORAGE_KEY = 'sniptale_step_badge_presets';

export type StepBadgePresetMutationResult = {
  id?: string;
  outcome: 'applied' | 'rejected' | 'unchanged';
  reason?:
    | 'disabled-default'
    | 'duplicate-id'
    | 'invalid-input'
    | 'last-enabled'
    | 'limit'
    | 'not-found'
    | 'quota'
    | 'system-delete'
    | 'unsafe-storage';
};

const logger = createLogger({ namespace: 'StepBadgePresetStorage' });
let snapshot: StepBadgePresetCatalog | null = null;
let snapshotRevision = 0;
let latestRead = 0;

function cache(catalog: StepBadgePresetCatalog) {
  snapshotRevision += 1;
  snapshot = cloneStepBadgePresetCatalog(catalog);
  return cloneStepBadgePresetCatalog(snapshot);
}

const writer = createStepBadgePresetWriteController({
  cache: (catalog) => {
    cache(catalog);
  },
  storageKey: STEP_BADGE_PRESETS_STORAGE_KEY,
});

async function readCatalog() {
  const values = await browserStorage.sync.get([STEP_BADGE_PRESETS_STORAGE_KEY]);
  const stored = values[STEP_BADGE_PRESETS_STORAGE_KEY];
  const parsed = parseStoredStepBadgePresetCatalog(stored);
  return { stored, parsed, catalog: resolveStoredStepBadgePresetCatalog(parsed.value) };
}

function unsafe(parsed: ReturnType<typeof parseStoredStepBadgePresetCatalog>) {
  const value = parsed.value;
  const future =
    (value.schemaVersion ?? 0) > STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION ||
    (value.systemCatalogRevision ?? 0) > SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION;
  if (parsed.hasInvalidRoot || parsed.invalidFieldCount || future) {
    logger.warn('Ignoring unsafe step badge preset catalog', {
      invalidFieldCount: parsed.invalidFieldCount,
      future,
    });
  }
  return parsed.hasInvalidRoot || parsed.invalidFieldCount > 0 || future;
}

export async function loadStepBadgePresetCatalog() {
  const request = ++latestRead;
  const revision = snapshotRevision;
  const loaded = await readCatalog();
  unsafe(loaded.parsed);
  if (request !== latestRead || revision !== snapshotRevision)
    return snapshot ? cloneStepBadgePresetCatalog(snapshot) : loaded.catalog;
  return cache(loaded.catalog);
}

export function getLoadedStepBadgePresetCatalogSnapshot() {
  return snapshot ? cloneStepBadgePresetCatalog(snapshot) : null;
}

export function subscribeToStepBadgePresetCatalog(
  listener: (catalog: StepBadgePresetCatalog) => void
) {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, area) => {
    if (area !== 'sync' || !(STEP_BADGE_PRESETS_STORAGE_KEY in changes)) return;
    const parsed = parseStoredStepBadgePresetCatalog(
      changes[STEP_BADGE_PRESETS_STORAGE_KEY]?.newValue
    );
    if (unsafe(parsed)) return;
    listener(cache(resolveStoredStepBadgePresetCatalog(parsed.value)));
  });
}

type Decision =
  | { outcome: 'applied'; catalog: StepBadgePresetCatalog; id?: string }
  | { outcome: 'rejected'; reason: NonNullable<StepBadgePresetMutationResult['reason']> }
  | { outcome: 'unchanged' };

async function command(
  mutate: (catalog: StepBadgePresetCatalog) => Decision
): Promise<StepBadgePresetMutationResult> {
  return writer.enqueueWrite(() =>
    runWithPersistenceDomainMutationLock('step-badge-presets', async (permit) => {
      const loaded = await readCatalog();
      if (unsafe(loaded.parsed)) return { outcome: 'rejected', reason: 'unsafe-storage' };
      const decision = mutate(cloneStepBadgePresetCatalog(loaded.catalog));
      if (decision.outcome !== 'applied') return decision;
      try {
        await writer.writeCatalog(decision.catalog, permit);
      } catch (error) {
        if (error instanceof StepBadgePresetQuotaError)
          return { outcome: 'rejected', reason: 'quota' };
        throw error;
      }
      return { outcome: 'applied', ...(decision.id ? { id: decision.id } : {}) };
    })
  );
}

function valid(name: string, settings: unknown): settings is StepBadgeTemplateSettings {
  return (
    name.trim().length > 0 &&
    name.trim().length <= MAX_STEP_BADGE_PRESET_NAME_LENGTH &&
    parseStepBadgeTemplateSettings(settings) !== null
  );
}

export function createUserStepBadgePreset(input: {
  name: string;
  settings: StepBadgeTemplateSettings;
}) {
  if (!valid(input.name, input.settings))
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' } as const);
  return command((catalog) => {
    if (
      catalog.presets.filter((preset) => preset.origin !== 'system').length >=
      MAX_USER_STEP_BADGE_PRESETS
    )
      return { outcome: 'rejected', reason: 'limit' };
    const id = `user-${globalThis.crypto.randomUUID()}`;
    const next = addStepBadgePreset(catalog, {
      id,
      name: input.name.trim(),
      settings: input.settings,
      order: catalog.presets.length,
      enabled: true,
      origin: 'user',
    });
    return next
      ? { outcome: 'applied', catalog: next, id }
      : { outcome: 'rejected', reason: 'duplicate-id' };
  });
}

export function updateStoredStepBadgePreset(
  input: Pick<StepBadgePreset, 'id' | 'name' | 'settings'>
) {
  if (!valid(input.name, input.settings))
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' } as const);
  return command((catalog) => {
    const next = updateStepBadgePreset(catalog, input);
    return next
      ? { outcome: 'applied', catalog: next }
      : { outcome: 'rejected', reason: 'not-found' };
  });
}

export function deleteStoredStepBadgePreset(id: string) {
  return command((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if (current.origin === 'system') return { outcome: 'rejected', reason: 'system-delete' };
    const next = deleteStepBadgePreset(catalog, id);
    return next
      ? { outcome: 'applied', catalog: next }
      : { outcome: 'rejected', reason: 'last-enabled' };
  });
}

export function setStoredStepBadgePresetEnabled(id: string, enabled: boolean) {
  return command((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if ((current.enabled !== false) === enabled) return { outcome: 'unchanged' };
    const next = setStepBadgePresetEnabled(catalog, id, enabled);
    return next
      ? { outcome: 'applied', catalog: next }
      : { outcome: 'rejected', reason: 'last-enabled' };
  });
}
export function setDefaultStoredStepBadgePreset(id: string) {
  return command((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if (catalog.defaultPresetId === id) return { outcome: 'unchanged' };
    const next = setDefaultStepBadgePreset(catalog, id);
    return next
      ? { outcome: 'applied', catalog: next }
      : { outcome: 'rejected', reason: 'disabled-default' };
  });
}
export function updateStoredStepBadgePresetOrder(ids: string[]) {
  return command((catalog) => {
    const next = reorderStepBadgePresets(catalog, ids);
    return next
      ? { outcome: 'applied', catalog: next }
      : { outcome: 'rejected', reason: 'invalid-input' };
  });
}
export function resetStoredSystemStepBadgePreset(id: string) {
  return command((catalog): Decision => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if (current.origin === 'system' && current.customized !== true) {
      return { outcome: 'unchanged' };
    }
    const next = resetSystemStepBadgePreset(catalog, id);
    return next
      ? { outcome: 'applied', catalog: next }
      : { outcome: 'rejected', reason: 'not-found' };
  });
}

export async function migrateStepBadgeSystemPresetCatalog() {
  return writer.enqueueWrite(() =>
    runWithPersistenceDomainMutationLock('step-badge-presets', async (permit) => {
      const loaded = await readCatalog();
      if (loaded.stored !== undefined && unsafe(loaded.parsed)) return false;
      const serialized = serializeStepBadgePresetCatalog(loaded.catalog);
      if (
        loaded.stored !== undefined &&
        JSON.stringify(loaded.stored) === JSON.stringify(serialized)
      )
        return false;
      await writer.writeCatalog(loaded.catalog, permit);
      return true;
    })
  );
}

export {
  cloneStepBadgePresetCatalog,
  resolveStoredStepBadgePresetCatalog,
  serializeStepBadgePresetCatalog,
} from './migration';
export { parseStepBadgeTemplateSettings, parseStoredStepBadgePresetCatalog } from './parser';
