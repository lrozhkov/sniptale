// policyStateIds: [] - transfer strategy and catalog sets are immutable planning policy, not authority state.
import type {
  SettingsTransferChangeSummary,
  SettingsTransferConflict,
  SettingsTransferConflictDecision,
  SettingsTransferDomainPayload,
  SettingsTransferJsonValue,
  SettingsTransferStrategy,
} from '../../contracts/settings-transfer';

export interface SettingsTransferPlan {
  domains: Record<string, SettingsTransferDomainPayload>;
  conflicts: SettingsTransferConflict[];
  summary: SettingsTransferChangeSummary;
}

type CollectionRemaps = Map<string, Map<string, string>>;

export function planSettingsTransfer(args: {
  current: Record<string, SettingsTransferDomainPayload>;
  imported: Record<string, SettingsTransferDomainPayload>;
  strategy: SettingsTransferStrategy;
  decisions?: Readonly<Record<string, SettingsTransferConflictDecision>>;
}): SettingsTransferPlan {
  const summary = emptySummary();
  const conflicts: SettingsTransferConflict[] = [];
  const remap = collectCopyRemaps(args);
  const importedDomains = remapImportedReferences(args.imported, remap);
  const domains = { ...args.current };
  for (const [domainId, imported] of Object.entries(importedDomains)) {
    const current = args.current[domainId];
    if (!current || args.strategy === 'exact-restore') {
      domains[domainId] = imported;
      summary.updated += current ? 1 : 0;
      summary.added += current ? 0 : 1;
      continue;
    }
    domains[domainId] = {
      schemaVersion: imported.schemaVersion,
      data: mergeValue({
        path: domainId,
        current: current.data,
        imported: imported.data,
        strategy: args.strategy,
        decisions: args.decisions ?? {},
        conflicts,
        summary,
        remap,
      }),
    };
  }
  return {
    domains: normalizeOrderedCollections(domains),
    conflicts,
    summary,
  };
}

function mergeValue(args: {
  path: string;
  current: SettingsTransferJsonValue;
  imported: SettingsTransferJsonValue;
  strategy: Exclude<SettingsTransferStrategy, 'exact-restore'>;
  decisions: Readonly<Record<string, SettingsTransferConflictDecision>>;
  conflicts: SettingsTransferConflict[];
  summary: SettingsTransferChangeSummary;
  remap: CollectionRemaps;
}): SettingsTransferJsonValue {
  if (deepEqual(args.current, args.imported)) {
    args.summary.unchanged += 1;
    return args.current;
  }
  if (Array.isArray(args.current) && Array.isArray(args.imported)) {
    return mergeArray(args);
  }
  if (isRecord(args.current) && isRecord(args.imported)) {
    const result: Record<string, SettingsTransferJsonValue> = { ...args.current };
    for (const [key, value] of Object.entries(args.imported)) {
      result[key] =
        key in args.current
          ? mergeValue({
              ...args,
              path: `${args.path}.${key}`,
              current: args.current[key]!,
              imported: value,
            })
          : value;
      if (!(key in args.current)) args.summary.added += 1;
    }
    return result;
  }
  const decision = registerConflict(args, 'scalar');
  if (decision === 'keep-local') {
    args.summary.skipped += 1;
    return args.current;
  }
  args.summary.updated += 1;
  return args.imported;
}

function mergeArray(args: Parameters<typeof mergeValue>[0]): SettingsTransferJsonValue[] {
  const current = args.current as SettingsTransferJsonValue[];
  const imported = args.imported as SettingsTransferJsonValue[];
  if (!current.every(hasStringId) || !imported.every(hasStringId)) {
    const decision = registerConflict(args, 'scalar');
    if (decision === 'keep-local') {
      args.summary.skipped += 1;
      return current;
    }
    args.summary.updated += 1;
    return imported;
  }
  const result = [...current];
  for (const importedItem of imported) {
    if (!hasStringId(importedItem)) continue;
    const importedRecord = importedItem;
    const index = result.findIndex(
      (currentItem) => hasStringId(currentItem) && currentItem.id === importedRecord.id
    );
    if (index < 0) {
      result.push(importedRecord);
      args.summary.added += 1;
      continue;
    }
    const currentItem = result[index]!;
    if (deepEqual(currentItem, importedRecord)) {
      args.summary.unchanged += 1;
      continue;
    }
    const conflictPath = `${args.path}.${importedRecord.id}`;
    const decision = registerConflict({ ...args, path: conflictPath }, 'item');
    if (decision === 'keep-local') {
      args.summary.skipped += 1;
      continue;
    }
    if (decision === 'import-as-copy') {
      const nextId =
        args.remap.get(args.path)?.get(importedRecord.id) ??
        createCopyId(importedRecord.id, result);
      result.push(materializeImportedCopy(args.path, importedRecord, nextId));
      args.summary.copiedRemapped += 1;
      continue;
    }
    result[index] = importedRecord;
    args.summary.updated += 1;
  }
  return result;
}

function materializeImportedCopy(
  collectionPath: string,
  importedItem: Record<string, SettingsTransferJsonValue> & { id: string },
  nextId: string
): Record<string, SettingsTransferJsonValue> & { id: string } {
  const copied = { ...importedItem, id: nextId };
  return STYLE_CATALOG_COLLECTIONS.has(collectionPath)
    ? { ...copied, origin: 'user', customized: false }
    : copied;
}

const STYLE_CATALOG_COLLECTIONS = new Set([
  'styles.borders.borderPresets',
  'styles.callouts.presets',
  'styles.numbering.presets',
  'styles.surfaces.presets',
  'styles.gradients.presets',
]);

function registerConflict(
  args: Parameters<typeof mergeValue>[0],
  kind: 'scalar' | 'item'
): SettingsTransferConflictDecision {
  const allowedDecisions: SettingsTransferConflictDecision[] =
    kind === 'item'
      ? ['keep-local', 'use-imported', 'import-as-copy']
      : ['keep-local', 'use-imported'];
  const defaultDecision = defaultConflictDecision(args.strategy, kind);
  args.conflicts.push({
    id: args.path,
    nodeId: args.path,
    kind,
    allowedDecisions,
    defaultDecision,
  });
  const requested = args.decisions[args.path];
  return requested && allowedDecisions.includes(requested) ? requested : defaultDecision;
}

function collectCopyRemaps(args: {
  current: Record<string, SettingsTransferDomainPayload>;
  imported: Record<string, SettingsTransferDomainPayload>;
  strategy: SettingsTransferStrategy;
  decisions?: Readonly<Record<string, SettingsTransferConflictDecision>>;
}): CollectionRemaps {
  const remaps: CollectionRemaps = new Map();
  if (args.strategy === 'exact-restore') return remaps;
  for (const [domainId, imported] of Object.entries(args.imported)) {
    const current = args.current[domainId];
    if (!current) continue;
    collectValueCopyRemaps({
      path: domainId,
      current: current.data,
      imported: imported.data,
      strategy: args.strategy,
      decisions: args.decisions ?? {},
      remaps,
    });
  }
  return remaps;
}

function collectValueCopyRemaps(args: {
  path: string;
  current: SettingsTransferJsonValue;
  imported: SettingsTransferJsonValue;
  strategy: Exclude<SettingsTransferStrategy, 'exact-restore'>;
  decisions: Readonly<Record<string, SettingsTransferConflictDecision>>;
  remaps: CollectionRemaps;
}): void {
  if (Array.isArray(args.current) && Array.isArray(args.imported)) {
    if (!args.current.every(hasStringId) || !args.imported.every(hasStringId)) return;
    const reservedIds = new Set([...args.current, ...args.imported].map((item) => item.id));
    for (const importedItem of args.imported) {
      const currentItem = args.current.find((item) => item.id === importedItem.id);
      if (!currentItem || deepEqual(currentItem, importedItem)) continue;
      const conflictPath = `${args.path}.${importedItem.id}`;
      const requested = args.decisions[conflictPath];
      const decision =
        requested && ['keep-local', 'use-imported', 'import-as-copy'].includes(requested)
          ? requested
          : defaultConflictDecision(args.strategy, 'item');
      if (decision !== 'import-as-copy') continue;
      const nextId = createCopyIdFromIds(importedItem.id, reservedIds);
      reservedIds.add(nextId);
      const collection = args.remaps.get(args.path) ?? new Map<string, string>();
      collection.set(importedItem.id, nextId);
      args.remaps.set(args.path, collection);
    }
    return;
  }
  if (!isRecord(args.current) || !isRecord(args.imported)) return;
  for (const [key, imported] of Object.entries(args.imported)) {
    const current = args.current[key];
    if (current === undefined) continue;
    collectValueCopyRemaps({
      ...args,
      path: `${args.path}.${key}`,
      current,
      imported,
    });
  }
}

function remapImportedReferences(
  domains: Record<string, SettingsTransferDomainPayload>,
  remaps: CollectionRemaps
): Record<string, SettingsTransferDomainPayload> {
  if (remaps.size === 0) return domains;
  return Object.fromEntries(
    Object.entries(domains).map(([domainId, payload]) => [
      domainId,
      { ...payload, data: remapImportedValue(payload.data, domainId, remaps) },
    ])
  );
}

function normalizeOrderedCollections(
  domains: Record<string, SettingsTransferDomainPayload>
): Record<string, SettingsTransferDomainPayload> {
  return Object.fromEntries(
    Object.entries(domains).map(([domainId, payload]) => [
      domainId,
      { ...payload, data: normalizeOrder(payload.data) },
    ])
  );
}

function normalizeOrder(value: SettingsTransferJsonValue): SettingsTransferJsonValue {
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeOrder);
    return normalized.every((item) => isRecord(item) && Number.isSafeInteger(item['order']))
      ? normalized.map((item, order) => ({
          ...(item as Record<string, SettingsTransferJsonValue>),
          order,
        }))
      : normalized;
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeOrder(item)])
  );
}

function remapImportedValue(
  value: SettingsTransferJsonValue,
  path: string,
  remaps: CollectionRemaps
): SettingsTransferJsonValue {
  const targetCollection = referenceTargetCollection(path);
  if (typeof value === 'string' && targetCollection) {
    return remaps.get(targetCollection)?.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string' && targetCollection) {
        return remaps.get(targetCollection)?.get(item) ?? item;
      }
      const itemPath = hasStringId(item) ? `${path}.${item.id}` : path;
      return remapImportedValue(item, itemPath, remaps);
    });
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, item]) => [
      childKey,
      remapImportedValue(item, `${path}.${childKey}`, remaps),
    ])
  );
}

function referenceTargetCollection(path: string): string | null {
  if (path.startsWith('capture.quick-actions.items.') && path.endsWith('.viewportPresetId'))
    return 'capture.viewport-presets.items';
  if (path === 'capture.viewport-presets.defaultId') return 'capture.viewport-presets.items';
  if (path.startsWith('capture.saving.default')) return 'capture.saving.templates';
  if (path.startsWith('ai.models.items.') && path.endsWith('.providerId'))
    return 'ai.providers.items';
  if (path === 'ai.models.defaultModelId') return 'ai.models.items';
  if (path === 'ai.prompt-templates.order') return 'ai.prompt-templates.items';
  if (path.endsWith('.linkedTemplates.calloutPresetId')) return 'styles.callouts.presets';
  if (path.endsWith('.linkedTemplates.stepBadgePresetId')) return 'styles.numbering.presets';
  if (path.endsWith('.tagIds')) return 'styles.tags.tags';
  const directTargets: Record<string, string> = {
    'styles.borders.defaultBorderPresetId': 'styles.borders.borderPresets',
    'styles.callouts.defaultPresetId': 'styles.callouts.presets',
    'styles.numbering.defaultPresetId': 'styles.numbering.presets',
    'styles.surfaces.defaultPresetId': 'styles.surfaces.presets',
    'styles.surfaces.favoriteIds': 'styles.surfaces.presets',
    'styles.gradients.defaultPresetId': 'styles.gradients.presets',
    'styles.gradients.favoriteIds': 'styles.gradients.presets',
    'styles.tool-presets.step.defaultPresetId': 'styles.tool-presets.step.presets',
    'styles.tool-presets.sceneBackground.defaultPresetId':
      'styles.tool-presets.sceneBackground.presets',
  };
  return directTargets[path] ?? null;
}

function defaultConflictDecision(
  strategy: Exclude<SettingsTransferStrategy, 'exact-restore'>,
  kind: 'scalar' | 'item'
): SettingsTransferConflictDecision {
  return strategy === 'safe-merge' && kind === 'item' ? 'import-as-copy' : 'use-imported';
}

function createCopyId(id: string, existing: readonly SettingsTransferJsonValue[]): string {
  const ids = new Set(existing.filter(hasStringId).map((item) => item.id));
  return createCopyIdFromIds(id, ids);
}

function createCopyIdFromIds(id: string, ids: ReadonlySet<string>): string {
  let suffix = 1;
  let candidate = `${id}-imported`;
  while (ids.has(candidate)) candidate = `${id}-imported-${++suffix}`;
  return candidate;
}

function hasStringId(
  value: SettingsTransferJsonValue
): value is Record<string, SettingsTransferJsonValue> & { id: string } {
  return isRecord(value) && typeof value['id'] === 'string';
}

function isRecord(
  value: SettingsTransferJsonValue
): value is Record<string, SettingsTransferJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function emptySummary(): SettingsTransferChangeSummary {
  return {
    added: 0,
    updated: 0,
    copiedRemapped: 0,
    unchanged: 0,
    skipped: 0,
    warnings: [],
    clearedAiSecretBindings: [],
    missingAiSecretBindings: [],
  };
}
