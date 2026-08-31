import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: vi.fn(async (keys: string[]) =>
        Object.fromEntries(
          keys.flatMap((key) => (key in storage.value ? [[key, storage.value[key]]] : []))
        )
      ),
      set: vi.fn(async (next: Record<string, unknown>) => {
        Object.assign(storage.value, structuredClone(next));
      }),
    },
  },
}));

import {
  GALLERY_SAVED_VIEWS_STORAGE_KEY,
  GallerySavedViewError,
  createGallerySavedView,
  deleteGallerySavedView,
  listGallerySavedViews,
  moveGallerySavedView,
  parsePortableGallerySavedViews,
  restoreGallerySavedViews,
  updateGallerySavedView,
  type GallerySavedViewFilterSnapshot,
} from './index';

const filters: GallerySavedViewFilterSnapshot = {
  activeTags: ['review'],
  facetFilters: {
    created: [],
    duration: [],
    format: ['png'],
    resolution: [],
    size: [],
    source: ['example.com'],
    updated: [],
  },
  scope: 'library',
};

beforeEach(() => {
  storage.value = {};
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    .mockReturnValue('00000000-0000-4000-8000-000000000003');
});

it('creates, updates, lists, and deletes one authoritative saved view', async () => {
  const created = await createGallerySavedView({
    filters,
    folderFilter: 'screenshot',
    name: '  Review   PNG  ',
  });

  expect(created.name).toBe('Review PNG');
  await expect(listGallerySavedViews()).resolves.toEqual([created]);

  const updated = await updateGallerySavedView(created.id, {
    ...filters,
    activeTags: ['approved'],
  });
  expect(updated.filters.activeTags).toEqual(['approved']);

  await deleteGallerySavedView(created.id);
  await expect(listGallerySavedViews()).resolves.toEqual([]);
});

it('rejects duplicate names only inside the same category', async () => {
  await createGallerySavedView({ filters, folderFilter: 'screenshot', name: 'Review' });
  await expect(
    createGallerySavedView({ filters, folderFilter: 'screenshot', name: ' review ' })
  ).rejects.toMatchObject({ code: 'conflict' } satisfies Partial<GallerySavedViewError>);
  await expect(
    createGallerySavedView({ filters, folderFilter: 'recording', name: 'Review' })
  ).resolves.toMatchObject({ folderFilter: 'recording' });
});

it('moves views only relative to siblings in the same category', async () => {
  const first = await createGallerySavedView({
    filters,
    folderFilter: 'screenshot',
    name: 'First',
  });
  const recording = await createGallerySavedView({
    filters,
    folderFilter: 'recording',
    name: 'Recording',
  });
  const second = await createGallerySavedView({
    filters,
    folderFilter: 'screenshot',
    name: 'Second',
  });

  await moveGallerySavedView(second.id, 'up');
  await expect(listGallerySavedViews()).resolves.toEqual([second, recording, first]);
  await moveGallerySavedView(second.id, 'up');
  await expect(listGallerySavedViews()).resolves.toEqual([second, recording, first]);
});

it('rejects malformed or duplicated portable values before persistence', () => {
  expect(() => parsePortableGallerySavedViews([{ id: 'missing-fields' }])).toThrow(
    GallerySavedViewError
  );
  expect(() => parsePortableGallerySavedViews(new Array(51).fill({}))).toThrow(
    GallerySavedViewError
  );
});

it('fails closed instead of overwriting a malformed authoritative record', async () => {
  storage.value[GALLERY_SAVED_VIEWS_STORAGE_KEY] = { version: 1, views: [{ broken: true }] };

  await expect(listGallerySavedViews()).rejects.toMatchObject({ code: 'invalid' });
  await expect(
    createGallerySavedView({ filters, folderFilter: 'screenshot', name: 'Review' })
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(storage.value[GALLERY_SAVED_VIEWS_STORAGE_KEY]).toEqual({
    version: 1,
    views: [{ broken: true }],
  });
});

it('applies skip, replace, and duplicate restore policies to category/name conflicts', async () => {
  const existing = await createGallerySavedView({
    filters,
    folderFilter: 'screenshot',
    name: 'Review',
  });
  const imported = [{ ...existing, filters: { ...filters, activeTags: ['imported'] } }];

  await restoreGallerySavedViews(imported, 'skip');
  expect((await listGallerySavedViews())[0]?.filters.activeTags).toEqual(['review']);

  await restoreGallerySavedViews(imported, 'replace');
  expect((await listGallerySavedViews())[0]?.filters.activeTags).toEqual(['imported']);

  await restoreGallerySavedViews(imported, 'duplicate');
  const views = await listGallerySavedViews();
  expect(views).toHaveLength(2);
  expect(views[1]?.name).toBe('Review (2)');
  expect(storage.value[GALLERY_SAVED_VIEWS_STORAGE_KEY]).toMatchObject({ version: 1 });
});

it('does not duplicate a view when the same archive restore resumes', async () => {
  const existing = await createGallerySavedView({
    filters,
    folderFilter: 'screenshot',
    name: 'Review',
  });

  await restoreGallerySavedViews([existing], 'duplicate', 'archive-1');
  await restoreGallerySavedViews([existing], 'duplicate', 'archive-1');

  const views = await listGallerySavedViews();
  expect(views).toHaveLength(2);
  expect(views[1]).toMatchObject({ id: 'backup:archive-1:0', name: 'Review (2)' });
});

it('uses the archive identity on the first duplicate restore so a resumed completion is idempotent', async () => {
  const imported = {
    createdAt: 1,
    filters,
    folderFilter: 'screenshot' as const,
    id: 'portable-view',
    name: 'Imported view',
    updatedAt: 1,
  };

  await restoreGallerySavedViews([imported], 'duplicate', 'archive-resume');
  await restoreGallerySavedViews([imported], 'duplicate', 'archive-resume');

  await expect(listGallerySavedViews()).resolves.toEqual([
    { ...imported, id: 'backup:archive-resume:0' },
  ]);
});

it('rejects a restore that would exceed the saved-view limit without partially writing it', async () => {
  const current = Array.from({ length: 50 }, (_, index) => ({
    createdAt: 1,
    filters,
    folderFilter: 'screenshot' as const,
    id: `view-${index}`,
    name: `View ${index}`,
    updatedAt: 1,
  }));
  storage.value[GALLERY_SAVED_VIEWS_STORAGE_KEY] = { version: 1, views: current };

  await expect(
    restoreGallerySavedViews(
      [{ ...current[0]!, id: 'new-view', name: 'New view' }],
      'duplicate',
      'full-archive'
    )
  ).rejects.toMatchObject({ code: 'limit' } satisfies Partial<GallerySavedViewError>);
  await expect(listGallerySavedViews()).resolves.toEqual(current);
});

it('rejects crossed identity and category-name replacements without changing either view', async () => {
  const first = {
    createdAt: 1,
    filters,
    folderFilter: 'screenshot' as const,
    id: 'first-id',
    name: 'First',
    updatedAt: 1,
  };
  const second = { ...first, id: 'second-id', name: 'Second' };
  storage.value[GALLERY_SAVED_VIEWS_STORAGE_KEY] = { version: 1, views: [first, second] };

  await expect(
    restoreGallerySavedViews([{ ...first, name: second.name }], 'replace')
  ).rejects.toMatchObject({ code: 'conflict' } satisfies Partial<GallerySavedViewError>);
  await expect(listGallerySavedViews()).resolves.toEqual([first, second]);
});

it('rejects two imported replacements that target the same original view', async () => {
  const existing = {
    createdAt: 1,
    filters,
    folderFilter: 'screenshot' as const,
    id: 'shared-id',
    name: 'Original name',
    updatedAt: 1,
  };
  storage.value[GALLERY_SAVED_VIEWS_STORAGE_KEY] = { version: 1, views: [existing] };

  await expect(
    restoreGallerySavedViews(
      [
        { ...existing, id: 'new-id', name: existing.name },
        { ...existing, id: existing.id, name: 'Other name' },
      ],
      'replace'
    )
  ).rejects.toMatchObject({ code: 'conflict' } satisfies Partial<GallerySavedViewError>);
  await expect(listGallerySavedViews()).resolves.toEqual([existing]);
});
