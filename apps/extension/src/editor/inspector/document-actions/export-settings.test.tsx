// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorExportSettingsState } from './export-settings';
import {
  EDITOR_EXPORT_SETTINGS_CHANGED_EVENT,
  dispatchEditorExportSettingsChanged,
  readEditorExportSettingsChangedEvent,
} from './export-settings-events';

const mocks = vi.hoisted(() => ({
  loadEditorExportSettings: vi.fn(),
  patchEditorExportSettings: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/clipboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/clipboard')>()),
  isBrowserClipboardImageFormatSupported: (format: string) => format === 'png',
}));

vi.mock('../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/export-settings')>()),
  loadEditorExportSettings: mocks.loadEditorExportSettings,
  patchEditorExportSettings: mocks.patchEditorExportSettings,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: { error: mocks.toastError },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let lastState: ReturnType<typeof useEditorExportSettingsState> | null = null;

function Probe() {
  lastState = useEditorExportSettingsState();
  return null;
}

function renderProbe() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Probe />));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  lastState = null;
  mocks.loadEditorExportSettings.mockResolvedValue({ imageFormat: 'png', imageQuality: 100 });
  mocks.patchEditorExportSettings.mockImplementation(async (patch) => ({
    imageFormat: patch.imageFormat ?? 'png',
    imageQuality: patch.imageQuality ?? 100,
  }));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('loads export settings, persists format changes, and syncs peer hook instances', async () => {
  renderProbe();
  await flush();

  expect(lastState?.imageFormat).toBe('png');
  expect(lastState?.isQualityDisabled).toBe(true);
  expect(lastState?.isClipboardCopySupported).toBe(true);

  await act(async () => {
    await lastState?.setImageFormat('jpeg');
  });

  expect(mocks.patchEditorExportSettings).toHaveBeenCalledWith({ imageFormat: 'jpeg' });
  expect(lastState?.imageFormat).toBe('jpeg');
  expect(lastState?.isClipboardCopySupported).toBe(false);
});

it('commits quality once for the current draft and rolls back on failure', async () => {
  renderProbe();
  await flush();

  act(() => lastState?.setImageQuality(80));
  await act(async () => {
    await lastState?.commitImageQuality();
    await lastState?.commitImageQuality();
  });

  expect(mocks.patchEditorExportSettings).toHaveBeenCalledWith({ imageQuality: 80 });

  mocks.patchEditorExportSettings.mockRejectedValueOnce(new Error('persist failed'));
  act(() => lastState?.setImageQuality(60));
  await act(async () => {
    await lastState?.commitImageQuality();
  });

  expect(lastState?.imageQuality).toBe(80);
  expect(mocks.toastError).toHaveBeenCalledWith('persist failed');
});

it('dispatches and reads export settings change events', () => {
  const listener = vi.fn((event: Event) => readEditorExportSettingsChangedEvent(event));
  window.addEventListener(EDITOR_EXPORT_SETTINGS_CHANGED_EVENT, listener);

  dispatchEditorExportSettingsChanged({ imageFormat: 'jpeg', imageQuality: 82 });

  expect(listener).toHaveReturnedWith({ imageFormat: 'jpeg', imageQuality: 82 });
  expect(readEditorExportSettingsChangedEvent(new Event('plain'))).toBeNull();
  expect(
    readEditorExportSettingsChangedEvent(
      new CustomEvent(EDITOR_EXPORT_SETTINGS_CHANGED_EVENT, {
        detail: { imageFormat: 'spoofed', imageQuality: 82 },
      })
    )
  ).toBeNull();

  window.removeEventListener(EDITOR_EXPORT_SETTINGS_CHANGED_EVENT, listener);
});
