// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  patchSettings: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
  patchSettings: mocks.patchSettings,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  showToast: mocks.showToast,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { useFullPageCapturePreferences } from './full-page-preferences';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  const state = useFullPageCapturePreferences();
  return (
    <>
      <button
        data-action="freeze"
        data-floating={state.preferences.floatingElements}
        data-freeze={String(state.preferences.freezeMotion)}
        data-lazy={String(state.preferences.preloadLazyContent)}
        data-saving={String(state.saving)}
        onClick={() => void state.updatePreferences({ freezeMotion: false })}
      />
      <button
        data-action="lazy"
        onClick={() => void state.updatePreferences({ preloadLazyContent: true })}
      />
    </>
  );
}

async function renderHarness(): Promise<HTMLButtonElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness />);
    await Promise.resolve();
  });
  const button = container.querySelector('button');
  if (!button) throw new Error('Missing preference harness button');
  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue({
    fullPageCapture: {
      floatingElements: 'hide',
      freezeMotion: true,
      preloadLazyContent: false,
    },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('loads the global persisted preferences without writing during read', async () => {
  const button = await renderHarness();

  expect(button.dataset).toMatchObject({ floating: 'hide', freeze: 'true', lazy: 'false' });
  expect(mocks.patchSettings).not.toHaveBeenCalled();
});

it('persists a nested patch and adopts the normalized stored result', async () => {
  mocks.patchSettings.mockResolvedValue({
    fullPageCapture: {
      floatingElements: 'hide',
      freezeMotion: false,
      preloadLazyContent: false,
    },
  });
  const button = await renderHarness();

  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mocks.patchSettings).toHaveBeenCalledWith({ fullPageCapture: { freezeMotion: false } });
  expect(button.dataset['freeze']).toBe('false');
  expect(mocks.showToast).not.toHaveBeenCalled();
});

it('rolls optimistic UI back and surfaces a toast when persistence fails', async () => {
  mocks.patchSettings.mockRejectedValue(new Error('storage failed'));
  const button = await renderHarness();

  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(button.dataset['freeze']).toBe('true');
  expect(button.dataset['saving']).toBe('false');
  expect(mocks.showToast).toHaveBeenCalledWith(
    'content.toolbar.fullPageSettingsSaveError',
    'error'
  );
});

it('queues rapid preference writes instead of dropping the later mutation', async () => {
  let resolveFirst: ((value: unknown) => void) | null = null;
  mocks.patchSettings
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockResolvedValueOnce({
      fullPageCapture: {
        floatingElements: 'hide',
        freezeMotion: false,
        preloadLazyContent: true,
      },
    });
  const freezeButton = await renderHarness();
  const lazyButton = container?.querySelector<HTMLButtonElement>('[data-action="lazy"]');

  await act(async () => {
    freezeButton.click();
    lazyButton?.click();
    await Promise.resolve();
  });
  expect(mocks.patchSettings).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveFirst?.({
      fullPageCapture: {
        floatingElements: 'hide',
        freezeMotion: false,
        preloadLazyContent: false,
      },
    });
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mocks.patchSettings).toHaveBeenNthCalledWith(2, {
    fullPageCapture: { preloadLazyContent: true },
  });
  expect(freezeButton.dataset).toMatchObject({ freeze: 'false', lazy: 'true', saving: 'false' });
});
