// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  patch: vi.fn(),
  subscribe: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.load,
  patchSettings: mocks.patch,
  subscribeToImagePreferencesChanges: mocks.subscribe,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: mocks.toast }));
vi.mock('../../../../platform/i18n', () => ({ translate: (key: string) => key }));

import { useToolbarImagePreferences } from './image-preferences';
import { ToolbarCaptureButtons } from './options';
import { useToolbarMenuState } from '../state/menu';

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useToolbarImagePreferences>;
let notify: (preferences: { imageFormat: 'png' | 'jpeg' | 'webp'; imageQuality: number }) => void;
const stop = vi.fn();

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function Harness() {
  state = useToolbarImagePreferences();
  return null;
}

async function mount() {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ imageFormat: 'jpeg', imageQuality: 73 });
  mocks.subscribe.mockImplementation((listener) => {
    notify = listener;
    return stop;
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('loads canonical preferences without writes and unsubscribes on unmount', async () => {
  await mount();
  expect(state).toMatchObject({ imageFormat: 'jpeg', imageQuality: 73, saving: false });
  expect(mocks.patch).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(stop).toHaveBeenCalledOnce();
});

it('retains an external commit after a delayed initial load', async () => {
  const load = gate<{ imageFormat: 'jpeg'; imageQuality: number }>();
  mocks.load.mockReturnValue(load.promise);
  await mount();
  act(() => notify({ imageFormat: 'webp', imageQuality: 88 }));
  await act(async () => {
    load.resolve({ imageFormat: 'jpeg', imageQuality: 30 });
  });
  expect(state).toMatchObject({ imageFormat: 'webp', imageQuality: 88 });
});

it('retains a committed PNG choice and hidden quality after a delayed initial load', async () => {
  const load = gate<{ imageFormat: 'jpeg'; imageQuality: number }>();
  mocks.load.mockReturnValue(load.promise);
  mocks.patch.mockResolvedValue({ imageFormat: 'png', imageQuality: 73 });
  await mount();
  await act(async () => {
    await state.updatePreferences({ imageFormat: 'png' });
  });
  await act(async () => {
    load.resolve({ imageFormat: 'jpeg', imageQuality: 30 });
  });
  expect(state).toMatchObject({ imageFormat: 'png', imageQuality: 73, saving: false });
  expect(mocks.patch).toHaveBeenCalledExactlyOnceWith({ imageFormat: 'png' });
});

it('serializes independent partial format and quality patches', async () => {
  const write = gate<{ imageFormat: 'png'; imageQuality: number }>();
  mocks.patch
    .mockReturnValueOnce(write.promise)
    .mockResolvedValueOnce({ imageFormat: 'png', imageQuality: 92 });
  await mount();
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = state.updatePreferences({ imageFormat: 'png' });
    second = state.updatePreferences({ imageQuality: 92 });
  });
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  expect(state.saving).toBe(true);
  await act(async () => {
    write.resolve({ imageFormat: 'png', imageQuality: 73 });
    await first;
    await second;
  });
  expect(mocks.patch.mock.calls).toEqual([[{ imageFormat: 'png' }], [{ imageQuality: 92 }]]);
  expect(state).toMatchObject({ imageFormat: 'png', imageQuality: 92, saving: false });
});

it('does not overwrite external reset or recreated preferences with a delayed write response', async () => {
  const write = gate<{ imageFormat: 'webp'; imageQuality: number }>();
  mocks.patch.mockReturnValue(write.promise);
  await mount();
  let saving!: Promise<void>;
  await act(async () => {
    saving = state.updatePreferences({ imageFormat: 'webp' });
  });
  act(() => notify({ imageFormat: 'png', imageQuality: 100 }));
  act(() => notify({ imageFormat: 'jpeg', imageQuality: 45 }));
  await act(async () => {
    write.resolve({ imageFormat: 'webp', imageQuality: 73 });
    await saving;
  });
  expect(state).toMatchObject({ imageFormat: 'jpeg', imageQuality: 45, saving: false });
});

it('retains the last committed values on failure and permits retry', async () => {
  mocks.patch
    .mockRejectedValueOnce(new Error('write refused'))
    .mockResolvedValueOnce({ imageFormat: 'webp', imageQuality: 73 });
  await mount();
  await act(async () => {
    await state.updatePreferences({ imageFormat: 'webp' });
  });
  expect(state).toMatchObject({ imageFormat: 'jpeg', imageQuality: 73, saving: false });
  expect(mocks.toast).toHaveBeenCalledWith('content.toolbar.fullPageSettingsSaveError', 'error');
  await act(async () => {
    await state.updatePreferences({ imageFormat: 'webp' });
  });
  expect(state).toMatchObject({ imageFormat: 'webp', imageQuality: 73, saving: false });
});

function InteractiveCaptureButtons() {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <ToolbarCaptureButtons
      compactMenus={false}
      currentViewport={null}
      displayMode="horizontal"
      isLoading={false}
      onTakeScreenshot={vi.fn()}
      toolbarMenuState={toolbarMenuState}
    />
  );
}

it('restores the displayed quality draft after a failed toolbar save and retains the menu', async () => {
  let refuse!: (error: Error) => void;
  mocks.patch.mockReturnValue(
    new Promise<never>((_resolve, reject) => {
      refuse = reject;
    })
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<InteractiveCaptureButtons />);
  });
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.capture-visible-settings-button"]'
      )
      ?.click()
  );
  const quality = container.querySelector<HTMLInputElement>('input[type="text"]');
  expect(container.querySelector('input[type="range"]')).toBeNull();
  expect(quality?.value).toBe('73');
  act(() => {
    quality?.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(quality, '74');
    quality?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(quality?.value).toBe('74');
  expect(mocks.patch).not.toHaveBeenCalled();
  await act(async () => {
    quality?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(mocks.patch).toHaveBeenCalledExactlyOnceWith({ imageQuality: 74 });
  expect(quality?.value).toBe('74');
  await act(async () => {
    refuse(new Error('write refused'));
  });
  expect(quality?.value).toBe('73');
  expect(container.querySelector('input[type="range"]')).toBeNull();
  expect(container.querySelector('.sniptale-screenshot-menu')).not.toBeNull();
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(
    'content.toolbar.fullPageSettingsSaveError',
    'error'
  );
});
