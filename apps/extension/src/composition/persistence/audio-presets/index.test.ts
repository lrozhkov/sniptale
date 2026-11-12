import { expect, it } from 'vitest';
import { listBuiltInAudioPresets } from '../../../features/video/audio/effects/presets';
import {
  isActivePersistenceMutationPermit,
  runWithPersistenceDomainMutationLock,
} from '../infrastructure/mutation-barrier';
import {
  parseAudioPresetCatalog,
  restoreAudioPresetCatalog,
  type AudioPresetCatalog,
} from './catalog';
import { createAudioPresetCatalogOwner } from './index';
function fixture() {
  let value: unknown,
    sequence = 1,
    writes = 0,
    rejectWrite = false;
  const createId = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
  const owner = createAudioPresetCatalogOwner({
    read: async () => structuredClone(value),
    write: async (next, permit) => {
      expect(isActivePersistenceMutationPermit(permit)).toBe(true);
      if (rejectWrite) throw new Error('quota');
      value = structuredClone(next);
      writes++;
    },
    runMutation: (operation) => runWithPersistenceDomainMutationLock('audio-presets', operation),
    createId,
    now: () => 10,
  });
  const preset = listBuiltInAudioPresets()[0]!.preset;
  return {
    owner,
    preset,
    createId,
    raw: () => structuredClone(value),
    writes: () => writes,
    set: (next: unknown) => {
      value = structuredClone(next);
    },
    fail: (enabled: boolean) => {
      rejectWrite = enabled;
    },
  };
}
async function seed(f: ReturnType<typeof fixture>): Promise<AudioPresetCatalog> {
  const result = await f.owner.mutate(await f.owner.read(), {
    kind: 'save',
    id: 'user-1',
    preset: f.preset,
  });
  expect(result.status).toBe('applied');
  return result.catalog;
}
it('opens an absent catalog without any write before an editor session', async () => {
  const f = fixture();
  expect(await f.owner.read()).toEqual(parseAudioPresetCatalog(undefined));
  expect(f.writes()).toBe(0);
});
it('serializes parallel writers against latest storage without losing accepted presets', async () => {
  const f = fixture(),
    basis = await seed(f);
  const results = await Promise.all(
    ['user-2', 'user-3'].map((id) =>
      f.owner.mutate(basis, { kind: 'save', id, preset: { ...f.preset, name: id } })
    )
  );
  expect(results.map((result) => result.status)).toEqual(['applied', 'applied']);
  expect((await f.owner.read()).presets.map((entry) => entry.id)).toEqual([
    'user-1',
    'user-2',
    'user-3',
  ]);
});
it(
  'makes an initial empty-generation race explicit and ' +
    'accepts a fresh retry without losing either value',
  async () => {
    const f = fixture(),
      basis = await f.owner.read();
    const [a, b] = await Promise.all(
      ['user-1', 'user-2'].map((id) =>
        f.owner.mutate(basis, { kind: 'save', id, preset: { ...f.preset, name: id } })
      )
    );
    expect(a!.status).toBe('applied');
    expect(b!.status).toBe('refused');
    expect(
      (
        await f.owner.mutate(await f.owner.read(), {
          kind: 'save',
          id: 'user-2',
          preset: { ...f.preset, name: 'user-2' },
        })
      ).status
    ).toBe('applied');
    expect((await f.owner.read()).presets).toHaveLength(2);
  }
);
it('refuses delayed writes after deletion and restore with no recreation or partial replacement', async () => {
  const f = fixture(),
    basis = await seed(f);
  expect((await f.owner.mutate(basis, { kind: 'delete', id: 'user-1' })).status).toBe('applied');
  expect((await f.owner.mutate(basis, { kind: 'rename', id: 'user-1', name: 'Late' })).status).toBe(
    'refused'
  );
  expect(
    (await f.owner.mutate(basis, { kind: 'save', id: 'user-1', preset: f.preset })).status
  ).toBe('refused');
  expect((await f.owner.read()).presets).toEqual([]);
  const restored = restoreAudioPresetCatalog(
    await f.owner.read(),
    { presets: [{ id: 'user-1', name: f.preset.name, preset: f.preset }] },
    f.createId,
    20
  )!;
  f.set(restored);
  expect(
    (await f.owner.mutate(basis, { kind: 'rename', id: 'user-1', name: 'Old generation' })).status
  ).toBe('refused');
  expect(await f.owner.read()).toEqual(restored);
});
it('refuses an old incarnation after deletion and recreation of the same identity and revision', async () => {
  const f = fixture(),
    basis = await seed(f),
    incarnation = basis.presets[0]!.incarnation;
  await f.owner.mutate(basis, { kind: 'delete', id: 'user-1' });
  const fresh = await f.owner.mutate(await f.owner.read(), {
    kind: 'save',
    id: 'user-1',
    preset: f.preset,
  });
  expect(fresh.catalog.presets[0]!.revision).toBe(1);
  expect(fresh.catalog.presets[0]!.incarnation).not.toBe(incarnation);
  expect(
    (await f.owner.mutate(basis, { kind: 'rename', id: 'user-1', name: 'Stale' })).status
  ).toBe('refused');
  expect(await f.owner.read()).toEqual(fresh.catalog);
});
it('retains accepted data on quota failure and makes identical retry idempotent', async () => {
  const f = fixture(),
    basis = await seed(f),
    before = f.raw();
  f.fail(true);
  await expect(
    f.owner.mutate(basis, { kind: 'save', id: 'user-2', preset: f.preset })
  ).rejects.toThrow('quota');
  expect(f.raw()).toEqual(before);
  f.fail(false);
  const accepted = await f.owner.mutate(basis, { kind: 'save', id: 'user-2', preset: f.preset });
  expect(accepted.status).toBe('applied');
  const writes = f.writes();
  expect(
    (await f.owner.mutate(basis, { kind: 'save', id: 'user-2', preset: f.preset })).status
  ).toBe('unchanged');
  expect(f.writes()).toBe(writes);
});
it('updates availability and defaults atomically, and prevents deleting or disabling the default', async () => {
  const f = fixture();
  let basis = await seed(f);
  basis = (await f.owner.mutate(basis, { kind: 'default', id: 'user-1' })).catalog;
  for (const kind of ['delete', 'toggle'] as const)
    expect((await f.owner.mutate(basis, { kind, id: 'user-1' })).status).toBe('refused');
  expect((await f.owner.mutate(basis, { kind: 'default', id: 'missing' })).status).toBe('refused');
  basis = (await f.owner.mutate(basis, { kind: 'default', id: null })).catalog;
  basis = (await f.owner.mutate(basis, { kind: 'toggle', id: 'builtin:room' })).catalog;
  expect(basis.preferences.disabledIds).toEqual(['builtin:room']);
  expect(
    (await f.owner.mutate(basis, { kind: 'reset', id: 'builtin:room' })).catalog.preferences
      .disabledIds
  ).toEqual([]);
});
it('refuses malformed or future catalog reads instead of overwriting them with defaults', async () => {
  const f = fixture();
  f.set({ version: 999, media: 'private' });
  const before = f.raw();
  await expect(f.owner.read()).rejects.toThrow('unsupported');
  await expect(
    f.owner.mutate(parseAudioPresetCatalog(undefined)!, {
      kind: 'save',
      id: 'user-1',
      preset: f.preset,
    })
  ).rejects.toThrow('unsupported');
  expect(f.raw()).toEqual(before);
  expect(f.writes()).toBe(0);
});
it('holds one admitted import operation through preparation and cancels before publication', async () => {
  const f = fixture(),
    basis = await seed(f),
    before = f.raw();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const abort = new AbortController();
  const pending = f.owner.mutate(
    basis,
    async () => {
      started();
      await gate;
      return { kind: 'save', id: 'imported', preset: f.preset };
    },
    abort.signal
  );
  await ready;
  abort.abort();
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.raw()).toEqual(before);
});
it('refuses an unavailable default without changing retained preset values', async () => {
  const f = fixture(),
    basis = await seed(f);
  const unavailable = structuredClone(f.preset);
  unavailable.processing.effects[0]!.processor.sha256 = '0'.repeat(64);
  const saved = await f.owner.mutate(basis, {
    kind: 'save',
    id: 'unavailable',
    preset: unavailable,
  });
  expect(saved.status).toBe('applied');
  const before = f.raw();
  expect((await f.owner.mutate(saved.catalog, { kind: 'default', id: 'unavailable' })).status).toBe(
    'refused'
  );
  expect(f.raw()).toEqual(before);
});
