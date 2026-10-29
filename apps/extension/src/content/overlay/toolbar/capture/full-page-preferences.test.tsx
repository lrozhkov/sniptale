// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../../../../composition/persistence/settings';
import { createCaptureSessionPreferences } from '../../../application/capture-preferences';
const isolated = vi.hoisted(() => ({
  owner: null as ReturnType<
    typeof import('../../../application/capture-preferences').createCaptureSessionPreferences
  > | null,
}));
vi.mock('../../../application/capture-preferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/capture-preferences')>()),
  pageCapturePreferences: {
    read: (workflow: 'visible' | 'full' | 'selection') => isolated.owner!.read(workflow),
    subscribe: (listener: () => void) => isolated.owner!.subscribe(listener),
    load: () => isolated.owner!.load(),
    update: (
      workflow: 'visible' | 'full' | 'selection',
      patch: Parameters<
        ReturnType<
          typeof import('../../../application/capture-preferences').createCaptureSessionPreferences
        >['update']
      >[1]
    ) => isolated.owner!.update(workflow, patch),
  },
}));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));
let root: Root;
let container: HTMLDivElement;
const settings = createDefaultSettings();
beforeEach(() => {
  settings.imageFormat = 'jpeg';
  settings.imageQuality = 73;
  settings.fullPageImage = { imageFormat: 'webp', imageQuality: 66 };
  settings.fullPageCapture = {
    freezeMotion: true,
    preloadLazyContent: true,
    floatingElements: 'once',
  };
  isolated.owner = createCaptureSessionPreferences({
    loadSettings: async () => structuredClone(settings),
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

import { useFullPageCapturePreferences } from './full-page-preferences';
let state: ReturnType<typeof useFullPageCapturePreferences>;
function Harness() {
  state = useFullPageCapturePreferences();
  return null;
}

it('uses full-page defaults and retains overrides without writing global settings', async () => {
  const before = structuredClone(settings);
  await act(async () => root.render(<Harness />));
  await act(async () => state.updatePreferences({ floatingElements: 'hide', freezeMotion: false }));
  expect(state.preferences).toEqual({
    floatingElements: 'hide',
    freezeMotion: false,
    preloadLazyContent: true,
  });
  await act(async () => root.render(null));
  await act(async () => root.render(<Harness />));
  expect(state.preferences.floatingElements).toBe('hide');
  expect(settings).toEqual(before);
});

it('uses current persistent defaults in a new document owner', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => state.updatePreferences({ preloadLazyContent: false }));
  await act(async () => root.render(null));
  isolated.owner = createCaptureSessionPreferences({ loadSettings: async () => settings });
  await act(async () => root.render(<Harness />));
  expect(state.preferences.preloadLazyContent).toBe(true);
});

it('accepts a local edit after a failed defaults read and preserves untouched settings on retry', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce({
      ...settings,
      fullPageCapture: {
        freezeMotion: true,
        preloadLazyContent: false,
        floatingElements: 'repeat',
      },
    });
  isolated.owner = createCaptureSessionPreferences({ loadSettings: load });
  await act(async () => root.render(<Harness />));
  await act(async () => {
    await expect(state.updatePreferences({ freezeMotion: false })).resolves.toBeUndefined();
  });
  await act(async () => isolated.owner!.load());
  expect(state.preferences).toEqual({
    freezeMotion: false,
    preloadLazyContent: false,
    floatingElements: 'repeat',
  });
});
