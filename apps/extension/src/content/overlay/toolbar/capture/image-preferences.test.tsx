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

import { useToolbarImagePreferences } from './image-preferences';
import { ToolbarCaptureButtons } from './options';
import { useToolbarMenuState } from '../state/menu';
let state: ReturnType<typeof useToolbarImagePreferences>;
function Harness() {
  state = useToolbarImagePreferences();
  return null;
}

it('loads defaults and keeps accepted changes local across hook remounts', async () => {
  const before = structuredClone(settings);
  await act(async () => root.render(<Harness />));
  expect(state).toMatchObject({ imageFormat: 'jpeg', imageQuality: 73 });
  await act(async () => state.updatePreferences({ imageFormat: 'png', imageQuality: 61 }));
  expect(state).toMatchObject({ imageFormat: 'png', imageQuality: 61 });
  await act(async () => root.render(null));
  await act(async () => root.render(<Harness />));
  expect(state).toMatchObject({ imageFormat: 'png', imageQuality: 61 });
  expect(settings).toEqual(before);
});

it('keeps full-page and visible-area image choices independent', async () => {
  function Both() {
    const visible = useToolbarImagePreferences('visible');
    const full = useToolbarImagePreferences('full');
    return (
      <button onClick={() => void full.updatePreferences({ imageFormat: 'png' })}>
        {visible.imageFormat}:{full.imageFormat}
      </button>
    );
  }
  await act(async () => root.render(<Both />));
  expect(container.textContent).toBe('jpeg:webp');
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toBe('jpeg:png');
});

it('previews quality without changing the session until Enter commits the numeric field', async () => {
  function Buttons() {
    return (
      <ToolbarCaptureButtons
        compactMenus
        currentViewport={null}
        displayMode="horizontal"
        isLoading={false}
        onTakeScreenshot={vi.fn()}
        toolbarMenuState={useToolbarMenuState()}
      />
    );
  }
  await act(async () => root.render(<Buttons />));
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.capture-visible-settings-button"]'
      )!
      .click()
  );
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.visible-capture-parameters"]')!
      .click()
  );
  const input = container.querySelector<HTMLInputElement>('input[type="text"]')!;
  expect(input.value).toBe('73');
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '74');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(isolated.owner!.read('visible').imageQuality).toBe(73);
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(isolated.owner!.read('visible').imageQuality).toBe(74);
  expect(settings.imageQuality).toBe(73);
});
