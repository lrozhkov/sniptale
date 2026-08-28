// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  loadPopupPagePackagePreferences: vi.fn(),
  savePopupPagePackagePreferences: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: mocks.debug,
    warn: vi.fn(),
  }),
}));

vi.mock(
  '../../../../../composition/persistence/popup-export-preferences',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/popup-export-preferences')
    >()),
    loadPopupPagePackagePreferences: mocks.loadPopupPagePackagePreferences,
    savePopupPagePackagePreferences: mocks.savePopupPagePackagePreferences,
  })
);

vi.mock('../../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n/popup')>()),
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
import { DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES } from '../../../../../composition/persistence/popup-export-preferences';

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
  mocks.loadPopupPagePackagePreferences.mockReset();
  mocks.savePopupPagePackagePreferences.mockReset();
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
  mocks.loadPopupPagePackagePreferences.mockResolvedValue({
    export: {
      includeAnnotations: false,
      includeBasicLogs: true,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: true,
      includeJson: false,
      includeMarkdown: true,
      includeWebCopy: false,
    },
    save: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includeWebCopy: true,
    },
  });
  mocks.savePopupPagePackagePreferences.mockResolvedValue(undefined);

  await renderHarness();
  await flushEffects();

  expect(latestState?.values.includeBasicLogs).toBe(true);
  expect(latestState?.values.includeJson).toBe(false);
  expect(latestState?.hasLoadedPreferences).toBe(true);

  await act(async () => {
    latestState?.actions.setIncludeFiles(false);
  });
  await flushEffects();

  expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalled();
  expect(mocks.loadPopupPagePackagePreferences).toHaveBeenCalledTimes(1);
});

it('logs failed hydration and still marks the hook as loaded', async () => {
  mocks.loadPopupPagePackagePreferences.mockRejectedValue(new Error('load failed'));
  mocks.savePopupPagePackagePreferences.mockResolvedValue(undefined);

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestState?.actions.setIncludeMarkdown(false);
  });

  expect(mocks.debug).toHaveBeenCalledWith(
    'Failed to hydrate page-package preferences',
    expect.any(Error)
  );
  expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalled();
});

it('logs failed persistence writes', async () => {
  mocks.loadPopupPagePackagePreferences.mockResolvedValue({
    export: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
      includeWebCopy: false,
    },
    save: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includeWebCopy: true,
    },
  });
  mocks.savePopupPagePackagePreferences.mockRejectedValue(new Error('save failed'));

  await renderHarness();
  await flushEffects();

  await act(async () => {
    latestState?.actions.setIncludeBasicLogs(true);
  });
  await flushEffects();

  expect(mocks.debug).toHaveBeenCalledWith(
    'Failed to persist page-package preferences',
    expect.any(Error)
  );
  expect(latestState?.values.includeBasicLogs).toBe(false);
  expect(mocks.toastError).toHaveBeenCalledWith('common.states.error');
});

it('serializes rapid writes and does not let an older failure roll back the latest edit', async () => {
  mocks.loadPopupPagePackagePreferences.mockResolvedValue({
    export: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
      includeWebCopy: false,
    },
    save: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includeWebCopy: true,
    },
  });
  let rejectFirst!: (error: Error) => void;
  mocks.savePopupPagePackagePreferences
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        })
    )
    .mockResolvedValueOnce(undefined);

  await renderHarness();
  await flushEffects();
  await act(async () => latestState?.actions.setIncludeBasicLogs(true));
  await vi.waitFor(() => expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalledTimes(1));

  await act(async () => latestState?.actions.setIncludeFiles(false));
  await flushEffects();
  expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalledTimes(1);

  await act(async () => rejectFirst(new Error('older write failed')));
  await vi.waitFor(() => expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalledTimes(2));

  expect(latestState?.values.includeBasicLogs).toBe(true);
  expect(latestState?.values.includeFiles).toBe(false);
  expect(mocks.toastError).not.toHaveBeenCalled();
  expect(mocks.savePopupPagePackagePreferences.mock.calls[1]?.[0]).toEqual(
    expect.objectContaining({
      export: expect.objectContaining({ includeBasicLogs: true, includeFiles: false }),
    })
  );
});

it('waits for an older successful write before committing the latest candidate', async () => {
  mocks.loadPopupPagePackagePreferences.mockResolvedValue(DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES);
  let resolveFirst!: () => void;
  mocks.savePopupPagePackagePreferences
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockResolvedValueOnce(undefined);

  await renderHarness();
  await flushEffects();
  await act(async () => latestState?.actions.setIncludeBasicLogs(true));
  await vi.waitFor(() => expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalledTimes(1));
  await act(async () => latestState?.actions.setIncludeFiles(false));
  await flushEffects();

  expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalledTimes(1);
  await act(async () => resolveFirst());
  await vi.waitFor(() => expect(mocks.savePopupPagePackagePreferences).toHaveBeenCalledTimes(2));
  expect(mocks.savePopupPagePackagePreferences.mock.calls[1]?.[0]).toEqual(
    expect.objectContaining({
      export: expect.objectContaining({ includeBasicLogs: true, includeFiles: false }),
    })
  );
});
