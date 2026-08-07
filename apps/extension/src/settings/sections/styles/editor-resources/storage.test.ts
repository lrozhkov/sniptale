// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createDefault: vi.fn(),
  load: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../../../../composition/persistence/editor-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/editor-presets')>()),
  createDefaultEditorPresetStorageState: persistence.createDefault,
  loadEditorPresetState: persistence.load,
  subscribeToEditorPresetState: persistence.subscribe,
}));

import { useEditorPresetStorageState } from './storage';

beforeEach(() => {
  vi.clearAllMocks();
  persistence.createDefault.mockReturnValue({ marker: 'default' });
  persistence.load.mockResolvedValue({ marker: 'loaded' });
  persistence.subscribe.mockReturnValue(vi.fn());
});

it('projects load and subscription updates and disposes its subscription', async () => {
  const values: unknown[] = [];
  let listener: ((value: unknown) => void) | undefined;
  const unsubscribe = vi.fn();
  persistence.subscribe.mockImplementation((next) => {
    listener = next;
    return unsubscribe;
  });
  function Harness() {
    values.push(useEditorPresetStorageState());
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(createElement(Harness));
    await Promise.resolve();
  });
  expect(values.at(-1)).toEqual({ marker: 'loaded' });
  act(() => listener?.({ marker: 'subscription' }));
  expect(values.at(-1)).toEqual({ marker: 'subscription' });
  act(() => root.unmount());
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('retains the default projection when loading fails', async () => {
  persistence.load.mockRejectedValueOnce(new Error('load failed'));
  let latest: unknown;
  function Harness() {
    latest = useEditorPresetStorageState();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(createElement(Harness));
    await Promise.resolve();
  });
  expect(latest).toEqual({ marker: 'default' });
  act(() => root.unmount());
});

it('ignores a pending load after disposal', async () => {
  let resolveLoad: ((value: unknown) => void) | undefined;
  persistence.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
  );
  const values: unknown[] = [];
  function Harness() {
    values.push(useEditorPresetStorageState());
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Harness)));
  act(() => root.unmount());
  await act(async () => resolveLoad?.({ marker: 'late' }));
  expect(values).toEqual([{ marker: 'default' }]);
});
