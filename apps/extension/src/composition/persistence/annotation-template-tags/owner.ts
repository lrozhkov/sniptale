// policyStateId: annotation-template-tag-mutation-queue - durable sync storage is authoritative;
// this disposable queue only preserves mutation order within one runtime.
import {
  ANNOTATION_TEMPLATE_TAG_LIMITS,
  cloneAnnotationTemplateTagState,
  type AnnotationTemplateTagState,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { SYSTEM_BORDER_PRESET_CATALOG_REVISION } from '../../../features/highlighter/presets/catalog';
import { SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION } from '../../../features/highlighter/step-badge-presets/catalog';
import { SYSTEM_CALLOUT_PRESET_CATALOG_REVISION } from '../../../features/highlighter/callout-presets/catalog';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  runWithPersistenceDomainMutationLock,
  runWithPersistenceDomainMutationLocks,
} from '../infrastructure/mutation-barrier';
import { cacheCoordinatedHighlighterSettings, HIGHLIGHTER_SETTINGS_KEY } from '../highlighter';
import { parseStoredHighlighterSettings } from '../highlighter/guards';
import { resolveLoadedHighlighterSettings } from '../highlighter/resolved';
import {
  cacheCoordinatedStepBadgePresetCatalog,
  STEP_BADGE_PRESETS_STORAGE_KEY,
} from '../step-badge-presets';
import {
  parseStoredStepBadgePresetCatalog,
  STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION,
} from '../step-badge-presets/parser';
import {
  cloneStepBadgePresetCatalog,
  resolveStoredStepBadgePresetCatalog,
  serializeStepBadgePresetCatalog,
} from '../step-badge-presets/migration';
import {
  cacheCoordinatedCalloutPresetCatalog,
  CALLOUT_PRESETS_STORAGE_KEY,
} from '../callout-presets';
import {
  CALLOUT_PRESET_STORAGE_SCHEMA_VERSION,
  parseStoredCalloutPresetCatalog,
} from '../callout-presets/parser';
import {
  cloneCalloutPresetCatalog,
  resolveStoredCalloutPresetCatalog,
  serializeCalloutPresetCatalog,
} from '../callout-presets/migration';
import {
  isUnsafeAnnotationTemplateTagState,
  normalizeAnnotationTemplateTagLabel,
  parseAnnotationTemplateTagState,
} from './parser';
import {
  ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY,
  AnnotationTemplateTagQuotaError,
  assertAnnotationTemplateTagStorageBudget,
} from './storage';

export type AnnotationTemplateKind = 'border' | 'callout' | 'step-badge';
export interface AnnotationTemplateTagMutationResult {
  id?: string;
  outcome: 'applied' | 'unchanged' | 'rejected' | 'quota' | 'unsafe-storage' | 'write-failed';
  reason?: 'invalid-input' | 'limit' | 'not-found';
}

let snapshot: AnnotationTemplateTagState | null = null;
let queue: Promise<void> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const operation = queue.catch(() => undefined).then(task);
  queue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}
function cache(state: AnnotationTemplateTagState): AnnotationTemplateTagState {
  snapshot = cloneAnnotationTemplateTagState(state);
  return cloneAnnotationTemplateTagState(snapshot);
}
async function readTags() {
  const values = await browserStorage.sync.get([ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]);
  const parsed = parseAnnotationTemplateTagState(values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]);
  return { parsed, state: parsed.value };
}

export async function loadAnnotationTemplateTagState(): Promise<AnnotationTemplateTagState> {
  const loaded = await readTags();
  if (isUnsafeAnnotationTemplateTagState(loaded.parsed)) {
    throw new Error('Unsupported annotation template tag storage state');
  }
  return cache(loaded.state);
}
export function subscribeToAnnotationTemplateTagState(
  listener: (state: AnnotationTemplateTagState) => void
) {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, area) => {
    if (area !== 'sync' || !(ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY in changes)) return;
    const parsed = parseAnnotationTemplateTagState(
      changes[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]?.newValue
    );
    if (!isUnsafeAnnotationTemplateTagState(parsed)) listener(cache(parsed.value));
  });
}

async function mutateTags(
  mutation: (
    state: AnnotationTemplateTagState
  ) => AnnotationTemplateTagMutationResult & { state?: AnnotationTemplateTagState }
): Promise<AnnotationTemplateTagMutationResult> {
  return enqueue(() =>
    runWithPersistenceDomainMutationLock('annotation-template-tags', async (permit) => {
      const loaded = await readTags();
      if (isUnsafeAnnotationTemplateTagState(loaded.parsed)) return { outcome: 'unsafe-storage' };
      const decision = mutation(cloneAnnotationTemplateTagState(loaded.state));
      if (decision.outcome !== 'applied' || !decision.state) return decision;
      try {
        assertAnnotationTemplateTagStorageBudget(
          ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY,
          decision.state
        );
        await browserStorage.sync.set(
          { [ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]: decision.state },
          permit
        );
        cache(decision.state);
        return { outcome: 'applied', ...(decision.id ? { id: decision.id } : {}) };
      } catch (error) {
        return {
          outcome: error instanceof AnnotationTemplateTagQuotaError ? 'quota' : 'write-failed',
        };
      }
    })
  );
}

export function createAnnotationTemplateTag(
  label: string
): Promise<AnnotationTemplateTagMutationResult> {
  const normalized = normalizeAnnotationTemplateTagLabel(label);
  if (
    !normalized ||
    Array.from(normalized).length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumLabelLength
  )
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' });
  return mutateTags((state) => {
    if (state.tags.length >= ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTags)
      return { outcome: 'rejected', reason: 'limit' };
    if (state.tags.some((tag) => tag.label.toLowerCase() === normalized.toLowerCase()))
      return { outcome: 'rejected', reason: 'invalid-input' };
    const id = `tag-${globalThis.crypto.randomUUID()}`;
    return {
      id,
      outcome: 'applied',
      state: { ...state, tags: [...state.tags, { id, label: normalized }] },
    };
  });
}
export function renameAnnotationTemplateTag(id: string, label: string) {
  const normalized = normalizeAnnotationTemplateTagLabel(label);
  if (
    !normalized ||
    Array.from(normalized).length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumLabelLength
  )
    return Promise.resolve({ outcome: 'rejected', reason: 'invalid-input' } as const);
  return mutateTags((state) => {
    const current = state.tags.find((tag) => tag.id === id);
    if (!current) return { outcome: 'rejected', reason: 'not-found' };
    if (current.label === normalized) return { outcome: 'unchanged' };
    if (
      state.tags.some(
        (tag) => tag.id !== id && tag.label.toLowerCase() === normalized.toLowerCase()
      )
    )
      return { outcome: 'rejected', reason: 'invalid-input' };
    return {
      outcome: 'applied',
      state: {
        ...state,
        tags: state.tags.map((tag) => (tag.id === id ? { ...tag, label: normalized } : tag)),
      },
    };
  });
}
export function setActiveAnnotationTemplateTagFilter(tagIds: string[]) {
  return mutateTags((state) => {
    const known = new Set(state.tags.map((tag) => tag.id));
    const next = [...new Set(tagIds)];
    if (next.some((id) => !known.has(id))) return { outcome: 'rejected', reason: 'invalid-input' };
    if (
      next.length === state.activeFilterTagIds.length &&
      next.every((id, index) => id === state.activeFilterTagIds[index])
    )
      return { outcome: 'unchanged' };
    return { outcome: 'applied', state: { ...state, activeFilterTagIds: next } };
  });
}

type CatalogBundle = Awaited<ReturnType<typeof readCatalogBundle>>;
async function readCatalogBundle() {
  const values = await browserStorage.sync.get([
    ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY,
    HIGHLIGHTER_SETTINGS_KEY,
    STEP_BADGE_PRESETS_STORAGE_KEY,
    CALLOUT_PRESETS_STORAGE_KEY,
  ]);
  const tags = parseAnnotationTemplateTagState(values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]);
  const highlighterParsed = parseStoredHighlighterSettings(values[HIGHLIGHTER_SETTINGS_KEY]);
  const stepParsed = parseStoredStepBadgePresetCatalog(values[STEP_BADGE_PRESETS_STORAGE_KEY]);
  const calloutParsed = parseStoredCalloutPresetCatalog(values[CALLOUT_PRESETS_STORAGE_KEY]);
  return {
    tags,
    highlighterParsed,
    highlighter: resolveLoadedHighlighterSettings(
      highlighterParsed.value.borderPresets,
      highlighterParsed.value.defaultBorderPresetId,
      highlighterParsed.value
    ),
    stepParsed,
    step: resolveStoredStepBadgePresetCatalog(stepParsed.value),
    calloutParsed,
    callout: resolveStoredCalloutPresetCatalog(calloutParsed.value),
  };
}
function unsafeBundle(bundle: CatalogBundle): boolean {
  return (
    isUnsafeAnnotationTemplateTagState(bundle.tags) ||
    bundle.highlighterParsed.hasInvalidRoot ||
    bundle.highlighterParsed.invalidFieldCount > 0 ||
    (bundle.highlighterParsed.value.systemPresetCatalogRevision ?? 0) >
      SYSTEM_BORDER_PRESET_CATALOG_REVISION ||
    bundle.stepParsed.hasInvalidRoot ||
    bundle.stepParsed.invalidFieldCount > 0 ||
    (bundle.stepParsed.value.schemaVersion ?? 0) > STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION ||
    (bundle.stepParsed.value.systemCatalogRevision ?? 0) >
      SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION ||
    bundle.calloutParsed.hasInvalidRoot ||
    bundle.calloutParsed.invalidFieldCount > 0 ||
    (bundle.calloutParsed.value.schemaVersion ?? 0) > CALLOUT_PRESET_STORAGE_SCHEMA_VERSION ||
    (bundle.calloutParsed.value.systemCatalogRevision ?? 0) > SYSTEM_CALLOUT_PRESET_CATALOG_REVISION
  );
}
function bundleHasUnknownTagReferences(bundle: CatalogBundle): boolean {
  const knownTagIds = new Set(bundle.tags.value.tags.map((tag) => tag.id));
  return [
    ...bundle.highlighter.borderPresets,
    ...bundle.step.presets,
    ...bundle.callout.presets,
  ].some((preset) => preset.tagIds.some((tagId) => !knownTagIds.has(tagId)));
}
function replaceTagIds(ids: string[], sourceId: string, targetId?: string): string[] {
  return [...new Set(ids.flatMap((id) => (id === sourceId ? (targetId ? [targetId] : []) : [id])))];
}
async function coordinatedTagReferenceMutation(
  sourceId: string,
  targetId?: string
): Promise<AnnotationTemplateTagMutationResult> {
  return enqueue(() =>
    runWithPersistenceDomainMutationLocks(
      ['annotation-template-tags', 'callout-presets', 'highlighter-settings', 'step-badge-presets'],
      async (permit) => {
        const bundle = await readCatalogBundle();
        if (unsafeBundle(bundle) || bundleHasUnknownTagReferences(bundle))
          return { outcome: 'unsafe-storage' };
        if (
          !bundle.tags.value.tags.some((tag) => tag.id === sourceId) ||
          (targetId && !bundle.tags.value.tags.some((tag) => tag.id === targetId))
        )
          return { outcome: 'rejected', reason: 'not-found' };
        const tagState = {
          ...bundle.tags.value,
          activeFilterTagIds: replaceTagIds(
            bundle.tags.value.activeFilterTagIds,
            sourceId,
            targetId
          ),
          tags: bundle.tags.value.tags.filter((tag) => tag.id !== sourceId),
        };
        const highlighter = {
          ...bundle.highlighter,
          borderPresets: bundle.highlighter.borderPresets.map((preset) => ({
            ...preset,
            tagIds: replaceTagIds(preset.tagIds, sourceId, targetId),
          })),
        };
        const step = {
          ...cloneStepBadgePresetCatalog(bundle.step),
          presets: bundle.step.presets.map((preset) => ({
            ...preset,
            tagIds: replaceTagIds(preset.tagIds, sourceId, targetId),
          })),
        };
        const callout = {
          ...cloneCalloutPresetCatalog(bundle.callout),
          presets: bundle.callout.presets.map((preset) => ({
            ...preset,
            tagIds: replaceTagIds(preset.tagIds, sourceId, targetId),
          })),
        };
        const stepStored = serializeStepBadgePresetCatalog(step);
        const calloutStored = serializeCalloutPresetCatalog(callout);
        const batch = {
          [ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]: tagState,
          [HIGHLIGHTER_SETTINGS_KEY]: highlighter,
          [STEP_BADGE_PRESETS_STORAGE_KEY]: stepStored,
          [CALLOUT_PRESETS_STORAGE_KEY]: calloutStored,
        };
        try {
          for (const [key, value] of Object.entries(batch))
            assertAnnotationTemplateTagStorageBudget(key, value);
          await browserStorage.sync.set(batch, permit);
        } catch (error) {
          return {
            outcome: error instanceof AnnotationTemplateTagQuotaError ? 'quota' : 'write-failed',
          };
        }
        cache(tagState);
        cacheCoordinatedHighlighterSettings(highlighter);
        cacheCoordinatedStepBadgePresetCatalog(step);
        cacheCoordinatedCalloutPresetCatalog(callout);
        return { outcome: 'applied' };
      }
    )
  );
}
export function deleteAnnotationTemplateTag(id: string) {
  return coordinatedTagReferenceMutation(id);
}
export function mergeAnnotationTemplateTag(sourceId: string, targetId: string) {
  if (sourceId === targetId) return Promise.resolve({ outcome: 'unchanged' } as const);
  return coordinatedTagReferenceMutation(sourceId, targetId);
}

type PreparedTagAssignment = {
  commit: () => void;
  key: string;
  stored: unknown;
};

function prepareBorderTagAssignment(
  value: unknown,
  presetId: string,
  tagIds: string[]
): AnnotationTemplateTagMutationResult | PreparedTagAssignment {
  const parsed = parseStoredHighlighterSettings(value);
  if (
    parsed.hasInvalidRoot ||
    parsed.invalidFieldCount > 0 ||
    (parsed.value.systemPresetCatalogRevision ?? 0) > SYSTEM_BORDER_PRESET_CATALOG_REVISION
  )
    return { outcome: 'unsafe-storage' };
  const catalog = resolveLoadedHighlighterSettings(
    parsed.value.borderPresets,
    parsed.value.defaultBorderPresetId,
    parsed.value
  );
  const current = catalog.borderPresets.find((preset) => preset.id === presetId);
  if (!current) return { outcome: 'rejected', reason: 'not-found' };
  if (sameTagIds(current.tagIds, tagIds)) return { outcome: 'unchanged' };
  const next = {
    ...catalog,
    catalogCustomized: true,
    borderPresets: catalog.borderPresets.map((preset) =>
      preset.id === presetId
        ? {
            ...preset,
            tagIds,
            ...(preset.origin === 'system' ? { customized: true as const } : {}),
          }
        : preset
    ),
  };
  return {
    commit: () => cacheCoordinatedHighlighterSettings(next),
    key: HIGHLIGHTER_SETTINGS_KEY,
    stored: next,
  };
}

function prepareCalloutTagAssignment(
  value: unknown,
  presetId: string,
  tagIds: string[]
): AnnotationTemplateTagMutationResult | PreparedTagAssignment {
  const parsed = parseStoredCalloutPresetCatalog(value);
  if (
    parsed.hasInvalidRoot ||
    parsed.invalidFieldCount > 0 ||
    (parsed.value.schemaVersion ?? 0) > CALLOUT_PRESET_STORAGE_SCHEMA_VERSION ||
    (parsed.value.systemCatalogRevision ?? 0) > SYSTEM_CALLOUT_PRESET_CATALOG_REVISION
  )
    return { outcome: 'unsafe-storage' };
  const catalog = resolveStoredCalloutPresetCatalog(parsed.value);
  const current = catalog.presets.find((preset) => preset.id === presetId);
  if (!current) return { outcome: 'rejected', reason: 'not-found' };
  if (sameTagIds(current.tagIds, tagIds)) return { outcome: 'unchanged' };
  const next = {
    ...catalog,
    presets: catalog.presets.map((preset) =>
      preset.id === presetId ? { ...preset, tagIds } : preset
    ),
  };
  return {
    commit: () => cacheCoordinatedCalloutPresetCatalog(next),
    key: CALLOUT_PRESETS_STORAGE_KEY,
    stored: serializeCalloutPresetCatalog(next),
  };
}

function prepareStepBadgeTagAssignment(
  value: unknown,
  presetId: string,
  tagIds: string[]
): AnnotationTemplateTagMutationResult | PreparedTagAssignment {
  const parsed = parseStoredStepBadgePresetCatalog(value);
  if (
    parsed.hasInvalidRoot ||
    parsed.invalidFieldCount > 0 ||
    (parsed.value.schemaVersion ?? 0) > STEP_BADGE_PRESET_STORAGE_SCHEMA_VERSION ||
    (parsed.value.systemCatalogRevision ?? 0) > SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION
  )
    return { outcome: 'unsafe-storage' };
  const catalog = resolveStoredStepBadgePresetCatalog(parsed.value);
  const current = catalog.presets.find((preset) => preset.id === presetId);
  if (!current) return { outcome: 'rejected', reason: 'not-found' };
  if (sameTagIds(current.tagIds, tagIds)) return { outcome: 'unchanged' };
  const next = {
    ...catalog,
    presets: catalog.presets.map((preset) =>
      preset.id === presetId ? { ...preset, tagIds } : preset
    ),
  };
  return {
    commit: () => cacheCoordinatedStepBadgePresetCatalog(next),
    key: STEP_BADGE_PRESETS_STORAGE_KEY,
    stored: serializeStepBadgePresetCatalog(next),
  };
}

function prepareTagAssignment(
  kind: AnnotationTemplateKind,
  value: unknown,
  presetId: string,
  tagIds: string[]
): AnnotationTemplateTagMutationResult | PreparedTagAssignment {
  if (kind === 'border') return prepareBorderTagAssignment(value, presetId, tagIds);
  if (kind === 'callout') return prepareCalloutTagAssignment(value, presetId, tagIds);
  return prepareStepBadgeTagAssignment(value, presetId, tagIds);
}

export function setAnnotationTemplateTagIds(
  kind: AnnotationTemplateKind,
  presetId: string,
  tagIds: string[]
) {
  const domains =
    kind === 'border'
      ? (['annotation-template-tags', 'highlighter-settings'] as const)
      : kind === 'callout'
        ? (['annotation-template-tags', 'callout-presets'] as const)
        : (['annotation-template-tags', 'step-badge-presets'] as const);
  return enqueue(() =>
    runWithPersistenceDomainMutationLocks(domains, async (permit) => {
      const targetKey =
        kind === 'border'
          ? HIGHLIGHTER_SETTINGS_KEY
          : kind === 'callout'
            ? CALLOUT_PRESETS_STORAGE_KEY
            : STEP_BADGE_PRESETS_STORAGE_KEY;
      const values = await browserStorage.sync.get([
        ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY,
        targetKey,
      ]);
      const tags = parseAnnotationTemplateTagState(values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]);
      if (isUnsafeAnnotationTemplateTagState(tags)) return { outcome: 'unsafe-storage' };
      const nextIds = [...new Set(tagIds)];
      const known = new Set(tags.value.tags.map((tag) => tag.id));
      if (
        nextIds.length > ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTagsPerTemplate ||
        nextIds.some((id) => !known.has(id))
      )
        return { outcome: 'rejected', reason: 'invalid-input' };
      const prepared = prepareTagAssignment(kind, values[targetKey], presetId, nextIds);
      if ('outcome' in prepared) return prepared;
      try {
        assertAnnotationTemplateTagStorageBudget(prepared.key, prepared.stored);
        await browserStorage.sync.set({ [prepared.key]: prepared.stored }, permit);
      } catch (error) {
        return {
          outcome: error instanceof AnnotationTemplateTagQuotaError ? 'quota' : 'write-failed',
        };
      }
      prepared.commit();
      return { outcome: 'applied' };
    })
  );
}

function sameTagIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export { normalizeAnnotationTemplateTagLabel, parseAnnotationTemplateTagState } from './parser';
