import { afterEach, expect, it, vi } from 'vitest';
import { reviewBuiltinTextTemplates } from '../../../features/video/review/annotation-effects/text-templates';
import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  ANNOTATION_TEXT_TEMPLATES_KEY,
  createBrowserReviewTextTemplateStorage,
  createReviewTextTemplateStorage,
} from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
  installPersistenceLockManagerForTests(null);
});

function fixture() {
  let stored: unknown;
  let tail = Promise.resolve();
  let fail = false;
  let beforeWrite: (() => Promise<void>) | undefined;
  const open = () =>
    createReviewTextTemplateStorage({
      read: async () => structuredClone(stored),
      write: async (catalog) => {
        await beforeWrite?.();
        if (fail) throw new Error('Write unavailable');
        stored = structuredClone(catalog);
      },
      mutate: <T>(operation: (permit: PersistenceMutationPermit) => Promise<T>) => {
        const result = tail.then(() => operation({} as PersistenceMutationPermit));
        tail = result.then(
          () => undefined,
          () => undefined
        );
        return result;
      },
    });
  return {
    open,
    beforeWrite(callback: () => Promise<void>) {
      beforeWrite = callback;
    },
    setFailure(value: boolean) {
      fail = value;
    },
    replace(value: unknown) {
      stored = value;
    },
  };
}

function create(name: string, afterDeletion: string | null = null) {
  return {
    id: crypto.randomUUID(),
    type: 'create' as const,
    name,
    template: reviewBuiltinTextTemplates.marker,
    afterDeletion,
  };
}

it('merges distinct writes from two windows after the first window releases the shared lock', async () => {
  const state = fixture();
  const first = state.open();
  const second = state.open();
  const writing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  state.beforeWrite(() => {
    writing.resolve();
    return release.promise;
  });
  const pending = first.change(create('Первый'));
  await writing.promise;
  const queued = second.change(create('Второй'));
  expect((await second.load()).records).toEqual([]);
  release.resolve();
  await expect(Promise.all([pending, queued])).resolves.toEqual([true, true]);
  expect((await second.load()).records.map(({ name }) => name)).toEqual(['Первый', 'Второй']);
});

it('fences a stale replace or delete and a delayed create replay after removal', async () => {
  const state = fixture();
  const owner = state.open();
  const staleWindow = state.open();
  const command = create('Версия первая');
  await owner.change(command);
  const original = (await staleWindow.load()).records[0]!;
  const changed = {
    ...command,
    type: 'update' as const,
    previous: original.revision,
    name: 'Новая версия',
  };
  await expect(owner.change(changed)).resolves.toBe(true);
  await expect(staleWindow.change(changed)).resolves.toBe(false);
  await expect(
    staleWindow.change({ ...original, type: 'delete', previous: original.revision })
  ).resolves.toBe(false);
  const current = (await owner.load()).records[0]!;
  await expect(
    owner.change({ ...current, type: 'delete', previous: current.revision })
  ).resolves.toBe(true);
  await expect(staleWindow.change(command)).resolves.toBe(false);
  await expect(staleWindow.change(changed)).resolves.toBe(false);
  const catalog = await owner.load();
  expect(catalog.records).toHaveLength(0);
  await expect(owner.change(create(current.name, catalog.deletionRevision))).resolves.toBe(true);
  expect((await owner.load()).records[0]!.id).not.toBe(original.id);
});

it('retries a failed transaction once and accepts a replay without creating a duplicate', async () => {
  const state = fixture();
  const owner = state.open();
  const command = create('Повтор');
  state.setFailure(true);
  await expect(owner.change(command)).rejects.toThrow('Write unavailable');
  expect((await owner.load()).records).toEqual([]);
  state.setFailure(false);
  await expect(owner.change(command)).resolves.toBe(true);
  const saved = await owner.load();
  await expect(owner.change(command)).resolves.toBe(true);
  expect(await owner.load()).toEqual(saved);
});

it('refuses unsupported catalog versions and invalid style data without replacing stored values', async () => {
  const state = fixture();
  const owner = state.open();
  const command = create('Проверка');
  await expect(
    owner.change({ ...command, template: { ...command.template, fontSize: Infinity } })
  ).resolves.toBe(false);
  expect((await owner.load()).records).toEqual([]);
  state.replace({ version: 2, records: [] });
  await expect(owner.load()).rejects.toThrow('catalog is unavailable');
  await expect(owner.change(command)).rejects.toThrow('catalog is unavailable');
});

it('refuses a mounted Gallery save during the exclusive Factory Reset barrier', async () => {
  const resetHeld = Promise.withResolvers<void>();
  const finishReset = Promise.withResolvers<void>();
  const resetDone = Promise.withResolvers<void>();
  const saveRequested = Promise.withResolvers<void>();
  let erasing = false;
  installPersistenceLockManagerForTests({
    async request(name, options, operation) {
      if (name !== 'sniptale:persistence:privacy-erasure') return operation({});
      if (options.mode === 'exclusive') {
        erasing = true;
        try {
          return await operation({});
        } finally {
          erasing = false;
          resetDone.resolve();
        }
      }
      if (!erasing) return operation({});
      saveRequested.resolve();
      if (options.ifAvailable) return operation(null);
      await resetDone.promise;
      return operation({});
    },
  });
  let values: Record<string, unknown> = {};
  const set = vi.fn((next: Record<string, unknown>, callback: () => void) => {
    values = next;
    callback();
  });
  vi.stubGlobal('chrome', {
    runtime: {},
    storage: {
      local: {
        get: (_keys: string[], callback: (value: unknown) => void) => callback(values),
        set,
      },
    },
  });
  const owner = createBrowserReviewTextTemplateStorage();
  expect(await owner.change(create('Существующий'))).toBe(true);
  const prepared = create('Текст до сброса', (await owner.load()).deletionRevision);
  set.mockClear();
  const reset = runWithPersistentDataErasureBarrier(async () => {
    delete values[ANNOTATION_TEXT_TEMPLATES_KEY];
    expect((await owner.load()).records).toEqual([]);
    resetHeld.resolve();
    await finishReset.promise;
  });
  await resetHeld.promise;
  const saving = owner.change(prepared).catch(() => false);
  await saveRequested.promise;
  finishReset.resolve();
  await reset;
  await expect(saving).resolves.toBe(false);
  expect(set).not.toHaveBeenCalled();
  expect((await owner.load()).records).toEqual([]);
  await expect(owner.change(create('Новое действие'))).resolves.toBe(true);
});
