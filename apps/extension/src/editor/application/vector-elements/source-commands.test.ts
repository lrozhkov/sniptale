import { openDB } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVectorLibraryTestHarness } from '../../../composition/persistence/vector-elements/test-support';
import { createEditorVectorLibraryMetadata } from '../../../composition/persistence/vector-elements';
import { activateDefaultEditorVectorSource } from './source-commands';

let harness: Awaited<ReturnType<typeof createVectorLibraryTestHarness>>;
const service = () => createEditorVectorLibraryMetadata();
beforeEach(async () => {
  harness = await createVectorLibraryTestHarness(openDB);
});
afterEach(() => harness.close());

it('parallel default initializers adopt one durable source winner without replaying writes', async () => {
  const library = service();
  const original = await library.readSettings();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  const readSettings = vi.fn(async () => {
    if (++reads <= 2) {
      if (reads === 2) release();
      await gate;
      return original;
    }
    return library.readSettings();
  });
  const updateSettings = vi.fn(library.updateSettings);
  const [first, second] = await Promise.all([
    activateDefaultEditorVectorSource({ readSettings, updateSettings }),
    activateDefaultEditorVectorSource({ readSettings, updateSettings }),
  ]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ networkEnabled: true, disclosureAccepted: true, revision: 1 });
  expect(first.incarnation).not.toBe('unconfigured');
  expect(updateSettings).toHaveBeenCalledTimes(2);
  expect(await library.readSettings()).toEqual(first);
});

it.each([{ networkEnabled: false }, { baseUrl: 'https://chosen.example/icons/' }])(
  'default initializer adopts the Settings winner %j without replay',
  async (patch) => {
    const library = service();
    const original = await library.readSettings();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const updateSettings = vi.fn(async (...args: Parameters<typeof library.updateSettings>) => {
      entered();
      await gate;
      return library.updateSettings(...args);
    });
    const pending = activateDefaultEditorVectorSource({
      readSettings: library.readSettings,
      updateSettings,
    });
    await started;
    const chosen = await library.updateSettings(patch, original);
    release();
    expect(await pending).toEqual(chosen);
    expect(
      await activateDefaultEditorVectorSource({
        readSettings: library.readSettings,
        updateSettings,
      })
    ).toEqual(chosen);
    expect(updateSettings).toHaveBeenCalledOnce();
    expect(await library.readSettings()).toEqual(chosen);
  }
);

it('default initializer preserves unconfigured settings on refusal and permits an explicit later retry', async () => {
  const library = service();
  const original = await library.readSettings();
  const refusal = new Error('Storage refused.');
  const updateSettings = vi.fn(library.updateSettings).mockRejectedValueOnce(refusal);
  const port = { readSettings: library.readSettings, updateSettings };
  await expect(activateDefaultEditorVectorSource(port)).rejects.toBe(refusal);
  expect(await library.readSettings()).toEqual(original);
  expect(updateSettings).toHaveBeenCalledOnce();
  const configured = await activateDefaultEditorVectorSource(port);
  expect(configured.incarnation).not.toBe('unconfigured');
  expect(configured.revision).toBe(1);
});
