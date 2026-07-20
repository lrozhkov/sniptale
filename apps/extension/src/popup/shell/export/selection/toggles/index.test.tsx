// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  loadPopupExportPreferences: vi.fn(),
  savePopupExportPreferences: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: mocks.debug,
  }),
}));

vi.mock(
  '../../../../../composition/persistence/popup-export-preferences',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/popup-export-preferences')
    >()),
    DEFAULT_POPUP_EXPORT_PREFERENCES: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includeHarDomLogs: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
    },
    loadPopupExportPreferences: mocks.loadPopupExportPreferences,
    savePopupExportPreferences: mocks.savePopupExportPreferences,
  })
);

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: mocks.toastError,
    },
  };
});

import { usePopupExportToggles } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof usePopupExportToggles> | null = null;

function ToggleHarness() {
  latestState = usePopupExportToggles();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ToggleHarness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.debug.mockReset();
  mocks.loadPopupExportPreferences.mockReset();
  mocks.savePopupExportPreferences.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

it('hydrates saved preferences and persists subsequent changes', async () => {
  mocks.loadPopupExportPreferences.mockResolvedValue({
    includeBasicLogs: true,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: false,
    includeMarkdown: true,
  });
  mocks.savePopupExportPreferences.mockResolvedValue(undefined);

  await renderHarness();
  await flushEffects();

  expect(latestState?.values.includeBasicLogs).toBe(true);
  expect(latestState?.values.includeJson).toBe(false);
  expect(latestState?.hasLoadedPreferences).toBe(true);

  await act(async () => {
    latestState?.actions.setIncludeFiles(false);
  });
  await flushEffects();

  expect(mocks.savePopupExportPreferences).toHaveBeenCalled();
  expect(mocks.loadPopupExportPreferences).toHaveBeenCalledTimes(1);
});

it('logs failed hydration and still marks the hook as loaded', async () => {
  mocks.loadPopupExportPreferences.mockRejectedValue(new Error('load failed'));
  mocks.savePopupExportPreferences.mockResolvedValue(undefined);

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestState?.actions.setIncludeMarkdown(false);
  });

  expect(mocks.debug).toHaveBeenCalledWith(
    'Failed to hydrate export preferences',
    expect.any(Error)
  );
  expect(mocks.savePopupExportPreferences).toHaveBeenCalled();
});

it('logs failed persistence writes', async () => {
  mocks.loadPopupExportPreferences.mockResolvedValue({
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
  });
  mocks.savePopupExportPreferences.mockRejectedValue(new Error('save failed'));

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestState?.actions.setIncludeBasicLogs(true);
  });
  await flushEffects();

  expect(mocks.debug).toHaveBeenCalledWith(
    'Failed to persist export preferences',
    expect.any(Error)
  );
  expect(latestState?.values.includeBasicLogs).toBe(false);
  expect(mocks.toastError).toHaveBeenCalledWith('common.states.error');
});
