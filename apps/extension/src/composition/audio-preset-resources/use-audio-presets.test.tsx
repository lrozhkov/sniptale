// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AudioProcessing } from '@sniptale/runtime-contracts/audio-effects';
import {
  listBuiltInAudioPresets,
  materializeAudioProcessingPreset,
  serializeAudioProcessingPreset,
} from '../../features/video/audio/effects/presets';
import {
  AUDIO_PRESET_STORAGE_KEY,
  parseAudioPresetCatalog,
} from '../persistence/audio-presets/catalog';
import { useAudioPresets } from './use-audio-presets';
const storage = vi.hoisted(() => ({
  value: undefined as unknown,
  get: vi.fn(),
  set: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { get: storage.get, set: storage.set },
    canObserveChanges: () => true,
    subscribeToChanges: storage.subscribe,
  },
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storage.value = undefined;
  storage.get.mockReset().mockImplementation(async () => ({
    [AUDIO_PRESET_STORAGE_KEY]: structuredClone(storage.value),
  }));
  storage.set.mockReset().mockImplementation(async (items: Record<string, unknown>) => {
    storage.value = structuredClone(items[AUDIO_PRESET_STORAGE_KEY]);
  });
  storage.subscribe.mockReset().mockReturnValue(() => undefined);
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function mount(value?: AudioProcessing) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current!: ReturnType<typeof useAudioPresets>;
  function Probe(props: { ownerKey: string; value: AudioProcessing | undefined }) {
    current = useAudioPresets(props.ownerKey, props.value);
    return null;
  }
  await act(async () => root.render(<Probe ownerKey="first" value={value} />));
  let mounted = true;
  const unmount = () => {
    if (mounted) {
      act(() => root.unmount());
      mounted = false;
      host.remove();
    }
  };
  cleanup = unmount;
  return {
    get: () => current,
    unmount,
    render: async (ownerKey: string, next?: AudioProcessing) => {
      await act(async () => root.render(<Probe ownerKey={ownerKey} value={next} />));
    },
  };
}
function file(source: string, text = async () => source): File {
  const result = new File([source], 'sound.json', { type: 'application/json' });
  Object.defineProperty(result, 'text', { value: text });
  return result;
}
it('loads without writing and materializes fixed presets without a project or catalog mutation', async () => {
  const mounted = await mount();
  expect(mounted.get().catalog).toEqual(parseAudioPresetCatalog(undefined));
  let selected: AudioProcessing | null = null;
  act(() => {
    selected = mounted.get().select('builtin:telephone');
  });
  expect(selected).toMatchObject({ effects: [{ kind: 'highpass' }, { kind: 'lowpass' }] });
  expect(storage.set).not.toHaveBeenCalled();
});
it('imports the same source once and retains its default preference on an identical retry', async () => {
  const value = materializeAudioProcessingPreset(listBuiltInAudioPresets()[0]!.preset)!;
  const mounted = await mount(value),
    source = serializeAudioProcessingPreset(value, 'My sound')!;
  await act(async () => {
    expect(await mounted.get().importFile(file(source))).toBe(true);
  });
  const first = mounted.get().catalog!.presets[0]!;
  await act(async () => {
    expect(await mounted.get().setDefault(first.id)).toBe(true);
  });
  const before = structuredClone(storage.value),
    writes = storage.set.mock.calls.length;
  await act(async () => {
    expect(await mounted.get().importFile(file(source))).toBe(true);
  });
  expect(storage.value).toEqual(before);
  expect(storage.set).toHaveBeenCalledTimes(writes);
  expect(
    mounted
      .get()
      .createDefaultProcessing()
      ?.effects.map((effect) => effect.kind)
  ).toEqual(['eq', 'compressor']);
});
it('cancels an in-progress file read on unmount before the catalog write', async () => {
  const mounted = await mount(),
    gate = deferred<string>(),
    started = deferred<void>();
  const source = JSON.stringify(listBuiltInAudioPresets()[0]!.preset);
  let pending!: Promise<boolean>;
  act(() => {
    pending = mounted.get().importFile(
      file(source, () => {
        started.resolve();
        return gate.promise;
      })
    );
  });
  await started.promise;
  mounted.unmount();
  gate.resolve(source);
  expect(await pending).toBe(false);
  expect(storage.set).not.toHaveBeenCalled();
  expect(storage.value).toBeUndefined();
});
it('rejects malformed and oversized input without changing the catalog and permits retry', async () => {
  const mounted = await mount();
  for (const source of ['{invalid', ' '.repeat(16 * 1024 + 1)])
    await act(async () => {
      expect(await mounted.get().importFile(file(source))).toBe(false);
    });
  expect(storage.set).not.toHaveBeenCalled();
  expect(mounted.get().error).toBe('write');
  await act(async () => {
    expect(
      await mounted.get().importFile(file(JSON.stringify(listBuiltInAudioPresets()[0]!.preset)))
    ).toBe(true);
  });
  expect(mounted.get().catalog?.presets).toHaveLength(1);
});
it('prevents an old catalog read from replacing a newer storage notification', async () => {
  const old = deferred<Record<string, unknown>>();
  storage.get.mockImplementationOnce(() => old.promise);
  const mounted = await mount();
  const latest = {
    ...parseAudioPresetCatalog(undefined)!,
    generation: '00000000-0000-4000-8000-000000000001',
    preferences: { defaultId: 'builtin:room', disabledIds: [] },
  };
  storage.value = latest;
  const listener = storage.subscribe.mock.calls[0]![0];
  await act(async () => {
    listener({ [AUDIO_PRESET_STORAGE_KEY]: { newValue: latest } }, 'local');
  });
  await act(async () =>
    old.resolve({ [AUDIO_PRESET_STORAGE_KEY]: parseAudioPresetCatalog(undefined) })
  );
  expect(mounted.get().catalog).toEqual(latest);
});
it('does not transfer a save completion selection to a different audio owner', async () => {
  const value = materializeAudioProcessingPreset(listBuiltInAudioPresets()[0]!.preset)!;
  const other = materializeAudioProcessingPreset(listBuiltInAudioPresets()[1]!.preset)!;
  const mounted = await mount(value),
    gate = deferred<void>(),
    entered = deferred<void>();
  storage.set.mockImplementationOnce(async (items: Record<string, unknown>) => {
    entered.resolve();
    await gate.promise;
    storage.value = structuredClone(items[AUDIO_PRESET_STORAGE_KEY]);
  });
  let pending!: Promise<boolean>;
  act(() => {
    pending = mounted.get().save('First owner');
  });
  await entered.promise;
  await mounted.render('second', other);
  await act(async () => {
    gate.resolve();
    expect(await pending).toBe(true);
  });
  expect(mounted.get().selectedId).toBe('builtin:telephone');
  expect(mounted.get().modified).toBe(false);
});
it('downloads only source JSON and revokes its owned URL after use', async () => {
  vi.useFakeTimers();
  const createObjectURL = vi.fn(() => 'blob:audio-preset'),
    revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    const value = materializeAudioProcessingPreset(listBuiltInAudioPresets()[0]!.preset)!;
    const mounted = await mount(value);
    act(() => mounted.get().exportCurrent());
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    act(() => vi.runAllTimers());
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:audio-preset');
    expect(storage.set).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
