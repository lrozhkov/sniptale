// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patchSettings: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  patchSettings: mocks.patchSettings,
}));

import { useToolbarPreferencePersistence } from './drag-position.effects';

function Harness() {
  useToolbarPreferencePersistence({
    compactMenus: false,
    displayMode: 'horizontal',
    isInitialized: true,
    position: { x: 10, y: 20 },
    preferencesReady: true,
  });
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('does not report toolbar persistence after the content extension context is invalidated', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.patchSettings.mockRejectedValueOnce(new Error('Extension context invalidated.'));

  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(mocks.patchSettings).toHaveBeenCalledOnce();
  expect(consoleError).not.toHaveBeenCalled();
});

it('continues to report genuine toolbar persistence failures', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.patchSettings.mockRejectedValueOnce(new Error('storage failed'));

  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(consoleError).toHaveBeenCalledWith(
    '[ContentToolbarDragPosition]',
    'Failed to persist content toolbar preferences',
    expect.any(Error)
  );
});
