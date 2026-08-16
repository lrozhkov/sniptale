import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  changeListener: null as
    | null
    | ((changes: Record<string, { newValue?: unknown }>, area: string) => void),
  failWrite: false,
  observe: false,
  set: vi.fn(),
  values: {} as Record<string, unknown>,
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: () => storage.observe,
    subscribeToChanges: (listener: typeof storage.changeListener) => {
      storage.changeListener = listener;
      return () => {
        storage.changeListener = null;
      };
    },
    sync: {
      get: vi.fn(async (keys: string[]) =>
        Object.fromEntries(
          keys.flatMap((key) => (key in storage.values ? [[key, storage.values[key]]] : []))
        )
      ),
      set: storage.set,
    },
  },
}));

import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import {
  resolveStoredCalloutPresetCatalog,
  serializeCalloutPresetCatalog,
} from '../callout-presets/migration';
import {
  resolveStoredStepBadgePresetCatalog,
  serializeStepBadgePresetCatalog,
} from '../step-badge-presets/migration';
import {
  ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY,
  createAnnotationTemplateTag,
  deleteAnnotationTemplateTag,
  loadAnnotationTemplateTagState,
  mergeAnnotationTemplateTag,
  renameAnnotationTemplateTag,
  resetSystemAnnotationTemplateTag,
  setActiveAnnotationTemplateTagFilter,
  setAnnotationTemplateTagIds,
  subscribeToAnnotationTemplateTagState,
} from '.';
import { areKnownAnnotationTemplateTagIds } from './known-ids';

beforeEach(() => {
  storage.failWrite = false;
  storage.observe = false;
  storage.changeListener = null;
  storage.set.mockReset().mockImplementation(async (values: Record<string, unknown>) => {
    if (storage.failWrite) throw new Error('write failed');
    Object.assign(storage.values, values);
  });
  const highlighter = createDefaultHighlighterSettings();
  highlighter.catalogCustomized = true;
  highlighter.borderPresets[0] = {
    ...highlighter.borderPresets[0]!,
    customized: true,
    tagIds: ['tag-one'],
  };
  const step = resolveStoredStepBadgePresetCatalog({});
  step.presets[0]!.tagIds = ['tag-one'];
  const callout = resolveStoredCalloutPresetCatalog({});
  callout.presets[0]!.tagIds = ['tag-one'];
  storage.values = {
    [ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]: {
      activeFilterTagIds: ['tag-one'],
      schemaVersion: 1,
      tags: [{ id: 'tag-one', label: 'Review' }],
    },
    sniptale_highlighter_settings: highlighter,
    sniptale_step_badge_presets: serializeStepBadgePresetCatalog(step),
    sniptale_callout_presets: serializeCalloutPresetCatalog(callout),
  };
});

it('loads, clones, and publishes only valid sync tag updates', async () => {
  await expect(loadAnnotationTemplateTagState()).resolves.toMatchObject({
    activeFilterTagIds: ['tag-one'],
  });
  storage.observe = true;
  const listener = vi.fn();
  const unsubscribe = subscribeToAnnotationTemplateTagState(listener);
  storage.changeListener?.({}, 'local');
  storage.changeListener?.(
    {
      [ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]: {
        newValue: {
          schemaVersion: 1,
          tags: [{ id: 'tag-two', label: 'New' }],
          activeFilterTagIds: [],
        },
      },
    },
    'sync'
  );
  expect(listener).toHaveBeenCalledWith({
    schemaVersion: 2,
    tags: expect.arrayContaining([
      expect.objectContaining({ id: 'system-tag-sniptale', origin: 'system' }),
      expect.objectContaining({ id: 'tag-two', label: 'New', origin: 'user' }),
    ]),
    activeFilterTagIds: [],
  });
  storage.changeListener?.(
    { [ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]: { newValue: { schemaVersion: 2 } } },
    'sync'
  );
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();

  storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] = {
    schemaVersion: 3,
    tags: [{ id: 'tag-two', label: 'Future' }],
    activeFilterTagIds: [],
  };
  await expect(loadAnnotationTemplateTagState()).rejects.toThrow(
    'Unsupported annotation template tag storage state'
  );
});

it('validates tag ids directly against the current registry', async () => {
  await expect(areKnownAnnotationTemplateTagIds(['tag-one'])).resolves.toBe(true);
  await expect(areKnownAnnotationTemplateTagIds(['missing'])).resolves.toBe(false);
  await expect(areKnownAnnotationTemplateTagIds(['tag-one', 'tag-one'])).resolves.toBe(false);
  storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] = {
    schemaVersion: 3,
    tags: [{ id: 'tag-one', label: 'Review' }],
    activeFilterTagIds: [],
  };
  await expect(areKnownAnnotationTemplateTagIds(['tag-one'])).resolves.toBe(false);
  storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] = { schemaVersion: 1, tags: 'bad' };
  await expect(areKnownAnnotationTemplateTagIds([])).resolves.toBe(false);
});

it.each(['border', 'step-badge', 'callout'] as const)(
  'rejects coordinated deletion when the %s catalog contains an orphan tag id',
  async (kind) => {
    if (kind === 'border') {
      const highlighter = storage.values['sniptale_highlighter_settings'] as ReturnType<
        typeof createDefaultHighlighterSettings
      >;
      highlighter.borderPresets[0]!.tagIds = ['orphan'];
    } else if (kind === 'step-badge') {
      const step = resolveStoredStepBadgePresetCatalog(
        storage.values['sniptale_step_badge_presets'] as Record<string, unknown>
      );
      step.presets[0]!.tagIds = ['orphan'];
      storage.values['sniptale_step_badge_presets'] = serializeStepBadgePresetCatalog(step);
    } else {
      const callout = resolveStoredCalloutPresetCatalog(
        storage.values['sniptale_callout_presets'] as Record<string, unknown>
      );
      callout.presets[0]!.tagIds = ['orphan'];
      storage.values['sniptale_callout_presets'] = serializeCalloutPresetCatalog(callout);
    }
    storage.set.mockClear();
    await expect(deleteAnnotationTemplateTag('tag-one')).resolves.toEqual({
      outcome: 'unsafe-storage',
    });
    expect(storage.set).not.toHaveBeenCalled();
  }
);

it('deletes tag references from all catalogs in one sync batch', async () => {
  await expect(deleteAnnotationTemplateTag('tag-one')).resolves.toEqual({ outcome: 'applied' });
  expect(storage.set).toHaveBeenCalledOnce();
  const batch = storage.set.mock.calls[0]![0] as Record<string, unknown>;
  expect(Object.keys(batch)).toHaveLength(4);
  expect(JSON.stringify(batch)).not.toContain('tag-one');
});

it('surfaces a failed batch without publishing partial storage state', async () => {
  const before = structuredClone(storage.values);
  storage.failWrite = true;
  await expect(deleteAnnotationTemplateTag('tag-one')).resolves.toEqual({
    outcome: 'write-failed',
  });
  expect(storage.values).toEqual(before);
});

it('normalizes CRUD labels and persists the shared active filter', async () => {
  const created = await createAnnotationTemplateTag('  Training   flow  ');
  expect(created).toMatchObject({ outcome: 'applied' });
  const createdId = created.id!;
  await expect(renameAnnotationTemplateTag(createdId, '  Training  ')).resolves.toEqual({
    outcome: 'applied',
  });
  await expect(createAnnotationTemplateTag('training')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(setActiveAnnotationTemplateTagFilter([createdId])).resolves.toEqual({
    outcome: 'applied',
  });
  expect(storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY]).toMatchObject({
    activeFilterTagIds: [createdId],
  });
  expect(
    (storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] as { tags: unknown[] }).tags
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: createdId, label: 'Training', origin: 'user' }),
    ])
  );
});

it('rejects invalid CRUD and filter transitions and treats exact values as unchanged', async () => {
  await expect(createAnnotationTemplateTag('   ')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(renameAnnotationTemplateTag('missing', 'Name')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(renameAnnotationTemplateTag('tag-one', 'Review')).resolves.toEqual({
    outcome: 'unchanged',
  });
  await expect(setActiveAnnotationTemplateTagFilter(['missing'])).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(setActiveAnnotationTemplateTagFilter(['tag-one'])).resolves.toEqual({
    outcome: 'unchanged',
  });
  await expect(deleteAnnotationTemplateTag('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(mergeAnnotationTemplateTag('tag-one', 'tag-one')).resolves.toEqual({
    outcome: 'unchanged',
  });
});

it('protects system tags from deletion and merge and restores their canonical label', async () => {
  await expect(createAnnotationTemplateTag('Sniptale')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(deleteAnnotationTemplateTag('system-tag-sniptale')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(mergeAnnotationTemplateTag('system-tag-paper', 'system-tag-neon')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(
    renameAnnotationTemplateTag('system-tag-sniptale', 'Sniptale Custom')
  ).resolves.toEqual({ outcome: 'applied' });
  await expect(resetSystemAnnotationTemplateTag('system-tag-sniptale')).resolves.toEqual({
    outcome: 'applied',
  });
  expect(
    (
      storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] as {
        tags: Array<{ customized?: boolean; id: string; label: string }>;
      }
    ).tags.find((tag) => tag.id === 'system-tag-sniptale')
  ).toMatchObject({ customized: false, label: 'Sniptale' });
});

it('enforces the registry size limit', async () => {
  storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] = {
    schemaVersion: 1,
    activeFilterTagIds: [],
    tags: Array.from({ length: 32 }, (_, index) => ({ id: `tag-${index}`, label: `Tag ${index}` })),
  };
  await expect(createAnnotationTemplateTag('Overflow')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'limit',
  });
});

it('merges references and the active filter without duplicate target ids', async () => {
  const tagState = storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] as {
    activeFilterTagIds: string[];
    tags: Array<{ id: string; label: string }>;
  };
  tagState.tags.push({ id: 'tag-two', label: 'Training' });
  tagState.activeFilterTagIds = ['tag-one', 'tag-two'];
  for (const preset of (
    storage.values['sniptale_highlighter_settings'] as ReturnType<
      typeof createDefaultHighlighterSettings
    >
  ).borderPresets) {
    preset.tagIds = ['tag-one', 'tag-two'];
  }

  await expect(mergeAnnotationTemplateTag('tag-one', 'tag-two')).resolves.toEqual({
    outcome: 'applied',
  });
  expect(JSON.stringify(storage.values)).not.toContain('tag-one');
  expect(
    (
      storage.values['sniptale_highlighter_settings'] as {
        borderPresets: Array<{ tagIds: string[] }>;
      }
    ).borderPresets[0]!.tagIds
  ).toEqual(['tag-two']);
});

it('assigns only fresh known ids and rejects stale references', async () => {
  await expect(
    setAnnotationTemplateTagIds('border', 'system-default', ['missing'])
  ).resolves.toEqual({ outcome: 'rejected', reason: 'invalid-input' });
  await expect(
    setAnnotationTemplateTagIds('border', 'system-default', ['tag-one'])
  ).resolves.toEqual({ outcome: 'unchanged' });
});

it('assigns tags to callout and step presets and reports write failures', async () => {
  const callout = resolveStoredCalloutPresetCatalog(
    storage.values['sniptale_callout_presets'] as Record<string, unknown>
  );
  const step = resolveStoredStepBadgePresetCatalog(
    storage.values['sniptale_step_badge_presets'] as Record<string, unknown>
  );
  const calloutId = callout.presets[0]!.id;
  const stepId = step.presets[0]!.id;
  callout.presets[0]!.tagIds = [];
  step.presets[0]!.tagIds = [];
  storage.values['sniptale_callout_presets'] = serializeCalloutPresetCatalog(callout);
  storage.values['sniptale_step_badge_presets'] = serializeStepBadgePresetCatalog(step);

  await expect(setAnnotationTemplateTagIds('callout', calloutId, ['tag-one'])).resolves.toEqual({
    outcome: 'applied',
  });
  await expect(setAnnotationTemplateTagIds('step-badge', stepId, ['tag-one'])).resolves.toEqual({
    outcome: 'applied',
  });
  await expect(setAnnotationTemplateTagIds('callout', 'missing', [])).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  storage.failWrite = true;
  await expect(setAnnotationTemplateTagIds('step-badge', stepId, [])).resolves.toEqual({
    outcome: 'write-failed',
  });
});

it('rejects future tag schemas and quota-breaking coordinated batches without a write', async () => {
  storage.set.mockClear();
  const tagState = storage.values[ANNOTATION_TEMPLATE_TAGS_STORAGE_KEY] as {
    schemaVersion: number;
  };
  tagState.schemaVersion = 3;
  await expect(createAnnotationTemplateTag('Future')).resolves.toEqual({
    outcome: 'unsafe-storage',
  });
  expect(storage.set).not.toHaveBeenCalled();

  tagState.schemaVersion = 2;
  const highlighter = storage.values['sniptale_highlighter_settings'] as ReturnType<
    typeof createDefaultHighlighterSettings
  >;
  highlighter.borderPresets[0]!.customCss = 'x'.repeat(8_000);
  await expect(deleteAnnotationTemplateTag('tag-one')).resolves.toEqual({ outcome: 'quota' });
  expect(storage.set).not.toHaveBeenCalled();
});
