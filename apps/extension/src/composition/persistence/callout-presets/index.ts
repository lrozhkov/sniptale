import type {
  CalloutPreset,
  CalloutPresetCatalog,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { createLogger } from '@sniptale/platform/observability/logger';
import { SYSTEM_CALLOUT_PRESET_CATALOG_REVISION } from '../../../features/highlighter/callout-presets/catalog';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import {
  cloneCalloutPresetCatalog,
  resolveStoredCalloutPresetCatalog,
  serializeCalloutPresetCatalog,
} from './migration';
import {
  addUserPreset,
  deleteUserPreset,
  reorderPresets,
  resetSystemPreset,
  setDefaultPreset,
  setPresetEnabled,
  updatePreset,
} from './mutations';
import {
  CALLOUT_PRESET_STORAGE_SCHEMA_VERSION,
  MAX_CALLOUT_PRESET_NAME_LENGTH,
  parseCalloutPresetContent,
  MAX_USER_CALLOUT_PRESETS,
  parseCalloutPresetPlacement,
  parseCalloutVisualStyle,
  parseStoredCalloutPresetCatalog,
} from './parser';
import { CalloutPresetQuotaError, createCalloutPresetWriteController } from './storage';

export const CALLOUT_PRESETS_STORAGE_KEY = 'sniptale_callout_presets';

export type CalloutPresetMutationReason =
  | 'disabled-default'
  | 'duplicate-id'
  | 'invalid-input'
  | 'last-enabled'
  | 'limit'
  | 'not-found'
  | 'quota'
  | 'system-delete'
  | 'unsafe-storage';

export interface CalloutPresetMutationResult {
  id?: string;
  outcome: 'applied' | 'rejected' | 'unchanged';
  reason?: CalloutPresetMutationReason;
}

const logger = createLogger({ namespace: 'CalloutPresetStorage' });
let loadedSnapshot: CalloutPresetCatalog | null = null;
let latestReadRequest = 0;
let snapshotRevision = 0;

function cacheCatalog(catalog: CalloutPresetCatalog): CalloutPresetCatalog {
  snapshotRevision += 1;
  loadedSnapshot = cloneCalloutPresetCatalog(catalog);
  return cloneCalloutPresetCatalog(loadedSnapshot);
}

const { enqueueWrite, writeCatalog } = createCalloutPresetWriteController({
  cacheCatalog: (catalog) => {
    cacheCatalog(catalog);
  },
  storageKey: CALLOUT_PRESETS_STORAGE_KEY,
});

function warnAboutInvalidStorage(parsed: ReturnType<typeof parseStoredCalloutPresetCatalog>): void {
  if (parsed.hasInvalidRoot) logger.warn('Ignoring invalid callout preset catalog root');
  if (parsed.invalidFieldCount > 0) {
    logger.warn('Dropped invalid callout preset catalog fields', {
      invalidFieldCount: parsed.invalidFieldCount,
    });
  }
}

function isUnsafeForWrite(parsed: ReturnType<typeof parseStoredCalloutPresetCatalog>): boolean {
  warnAboutInvalidStorage(parsed);
  const value = parsed.value;
  const isFutureSchema =
    value.schemaVersion !== undefined &&
    value.schemaVersion > CALLOUT_PRESET_STORAGE_SCHEMA_VERSION;
  const isFutureCatalog =
    value.systemCatalogRevision !== undefined &&
    value.systemCatalogRevision > SYSTEM_CALLOUT_PRESET_CATALOG_REVISION;
  if (isFutureSchema || isFutureCatalog) {
    logger.warn('Skipping callout preset write from a newer revision');
  }
  return parsed.hasInvalidRoot || parsed.invalidFieldCount > 0 || isFutureSchema || isFutureCatalog;
}

async function readCatalog() {
  const values = await browserStorage.sync.get([CALLOUT_PRESETS_STORAGE_KEY]);
  const stored = values[CALLOUT_PRESETS_STORAGE_KEY];
  const parsed = parseStoredCalloutPresetCatalog(stored);
  return { catalog: resolveStoredCalloutPresetCatalog(parsed.value), parsed, stored };
}

export async function loadCalloutPresetCatalog(): Promise<CalloutPresetCatalog> {
  const requestId = latestReadRequest + 1;
  latestReadRequest = requestId;
  const revisionAtStart = snapshotRevision;
  const loaded = await readCatalog();
  warnAboutInvalidStorage(loaded.parsed);
  if (requestId !== latestReadRequest || revisionAtStart !== snapshotRevision) {
    return loadedSnapshot
      ? cloneCalloutPresetCatalog(loadedSnapshot)
      : cloneCalloutPresetCatalog(loaded.catalog);
  }
  return cacheCatalog(loaded.catalog);
}

export function subscribeToCalloutPresetCatalog(
  listener: (catalog: CalloutPresetCatalog) => void
): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'sync' || !(CALLOUT_PRESETS_STORAGE_KEY in changes)) return;
    const parsed = parseStoredCalloutPresetCatalog(changes[CALLOUT_PRESETS_STORAGE_KEY]?.newValue);
    warnAboutInvalidStorage(parsed);
    listener(cacheCatalog(resolveStoredCalloutPresetCatalog(parsed.value)));
  });
}

export function getLoadedCalloutPresetCatalogSnapshot(): CalloutPresetCatalog | null {
  return loadedSnapshot ? cloneCalloutPresetCatalog(loadedSnapshot) : null;
}

type MutationDecision =
  | { catalog: CalloutPresetCatalog; id?: string; outcome: 'applied' }
  | { outcome: 'rejected' | 'unchanged'; reason?: CalloutPresetMutationReason };

async function runCommand(
  command: (catalog: CalloutPresetCatalog) => MutationDecision
): Promise<CalloutPresetMutationResult> {
  return enqueueWrite(() =>
    runWithPersistenceDomainMutationLock('callout-presets', async (permit) => {
      const loaded = await readCatalog();
      if (isUnsafeForWrite(loaded.parsed)) {
        return { outcome: 'rejected', reason: 'unsafe-storage' };
      }
      const decision = command(cloneCalloutPresetCatalog(loaded.catalog));
      if (decision.outcome !== 'applied') return decision;
      try {
        await writeCatalog(decision.catalog, permit);
      } catch (error) {
        if (error instanceof CalloutPresetQuotaError) {
          return { outcome: 'rejected', reason: 'quota' };
        }
        throw error;
      }
      return { outcome: 'applied', ...(decision.id ? { id: decision.id } : {}) };
    })
  );
}

export async function migrateCalloutSystemPresetCatalog(): Promise<boolean> {
  return enqueueWrite(() =>
    runWithPersistenceDomainMutationLock('callout-presets', async (permit) => {
      const loaded = await readCatalog();
      if (loaded.stored !== undefined && isUnsafeForWrite(loaded.parsed)) {
        return false;
      }
      const serialized = serializeCalloutPresetCatalog(loaded.catalog);
      if (
        loaded.stored !== undefined &&
        JSON.stringify(loaded.stored) === JSON.stringify(serialized)
      ) {
        return false;
      }
      await writeCatalog(loaded.catalog, permit);
      return true;
    })
  );
}

function isValidName(name: string): boolean {
  const length = name.trim().length;
  return length > 0 && length <= MAX_CALLOUT_PRESET_NAME_LENGTH;
}

function createUserPresetId(): string {
  return `user-${globalThis.crypto.randomUUID()}`;
}

export function createUserCalloutPreset(input: {
  content?: CalloutPreset['content'];
  name: string;
  placement: CalloutPreset['placement'];
  style: CalloutVisualStyle;
}): Promise<CalloutPresetMutationResult> {
  if (
    !isValidName(input.name) ||
    (input.content !== undefined && !parseCalloutPresetContent(input.content)) ||
    !parseCalloutPresetPlacement(input.placement) ||
    !parseCalloutVisualStyle(input.style)
  ) {
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' });
  }
  return runCommand((catalog) => {
    if (
      catalog.presets.filter((preset) => preset.origin !== 'system').length >=
      MAX_USER_CALLOUT_PRESETS
    ) {
      return { outcome: 'rejected', reason: 'limit' };
    }
    const id = createUserPresetId();
    const next = addUserPreset(catalog, {
      id,
      content: input.content ?? { titleText: '' },
      name: input.name.trim(),
      placement: input.placement,
      style: input.style,
    });
    return next
      ? { catalog: next, id, outcome: 'applied' }
      : { outcome: 'rejected', reason: 'duplicate-id' };
  });
}

export function updateCalloutPreset(input: {
  content?: CalloutPreset['content'];
  id: string;
  name: string;
  placement: CalloutPreset['placement'];
  style: CalloutVisualStyle;
}): Promise<CalloutPresetMutationResult> {
  if (
    !isValidName(input.name) ||
    (input.content !== undefined && !parseCalloutPresetContent(input.content)) ||
    !parseCalloutPresetPlacement(input.placement) ||
    !parseCalloutVisualStyle(input.style)
  ) {
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' });
  }
  return runCommand((catalog) => {
    if (!catalog.presets.some((preset) => preset.id === input.id)) {
      return { outcome: 'rejected', reason: 'not-found' };
    }
    const current = catalog.presets.find((preset) => preset.id === input.id)!;
    const next = updatePreset(catalog, {
      ...input,
      content: input.content ?? current.content,
    });
    return next ? { catalog: next, outcome: 'applied' } : { outcome: 'unchanged' };
  });
}

export function deleteCalloutPreset(id: string): Promise<CalloutPresetMutationResult> {
  return runCommand((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if (current.origin === 'system') return { outcome: 'rejected', reason: 'system-delete' };
    const next = deleteUserPreset(catalog, id);
    return next
      ? { catalog: next, outcome: 'applied' }
      : { outcome: 'rejected', reason: 'last-enabled' };
  });
}

export function setDefaultCalloutPreset(id: string): Promise<CalloutPresetMutationResult> {
  return runCommand((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if (current.enabled === false) return { outcome: 'rejected', reason: 'disabled-default' };
    const next = setDefaultPreset(catalog, id);
    return next ? { catalog: next, outcome: 'applied' } : { outcome: 'unchanged' };
  });
}

export function setCalloutPresetEnabled(
  id: string,
  enabled: boolean
): Promise<CalloutPresetMutationResult> {
  return runCommand((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if ((current.enabled !== false) === enabled) return { outcome: 'unchanged' };
    const next = setPresetEnabled(catalog, id, enabled);
    return next
      ? { catalog: next, outcome: 'applied' }
      : { outcome: 'rejected', reason: 'last-enabled' };
  });
}

export function updateCalloutPresetsOrder(ids: string[]): Promise<CalloutPresetMutationResult> {
  if (new Set(ids).size !== ids.length) {
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' });
  }
  return runCommand((catalog) => {
    const next = reorderPresets(catalog, ids);
    return next ? { catalog: next, outcome: 'applied' } : { outcome: 'unchanged' };
  });
}

export function resetSystemCalloutPreset(id: string): Promise<CalloutPresetMutationResult> {
  return runCommand((catalog) => {
    const current = catalog.presets.find((preset) => preset.id === id);
    if (!current || current.origin !== 'system') {
      return { outcome: 'rejected', reason: 'not-found' };
    }
    const next = resetSystemPreset(catalog, id);
    return next ? { catalog: next, outcome: 'applied' } : { outcome: 'unchanged' };
  });
}
