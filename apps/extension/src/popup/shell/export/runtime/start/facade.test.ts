import { expect, it, vi } from 'vitest';

import { startPopupExport as startPopupExportFacade } from './';
import { startPopupExport as startPopupExportImpl } from './execute';
import { createPopupExportRuntimeStateFixture } from '../state.test-support';
import type { PopupExportRuntimeDeps } from '../types';

function createStartState(includeFullPageScreenshot = false) {
  return createPopupExportRuntimeStateFixture({
    availableTabs: [
      {
        disabledReason: null,
        isCurrent: true,
        tabId: 42,
        title: 'Page',
        url: 'https://example.test',
      },
    ],
    includeFullPageScreenshot,
    selectedTabIds: [42],
    selectedTabIdsInOrder: [42],
  });
}

function createStartDeps(overrides: Partial<PopupExportRuntimeDeps> = {}): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: () => 'job-1',
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    scheduleTimeout: vi.fn(),
    sendStartJobMessage: vi.fn(async () => ({
      status: {
        activatedTabIds: [],
        effectiveComponentPlan: {
          components: {
            attachments: true,
            diagnostics: false,
            images: true,
            pageData: true,
            webCopy: false,
          },
          diagnosticsLevel: 'none' as const,
          includeScreenshot: false,
        },
        effectiveOptions: {
          includeAnnotations: false,
          includeBasicLogs: false,
          includeCssDiagnostics: false,
          includeFiles: true,
          includeFullPageScreenshot: false,
          includePageDiagnostics: false,
          includeImages: true,
          includeJson: true,
          includeMarkdown: true,
        },
        intent: 'export' as const,
        jobId: 'job-1',
        orderedTabs: [{ tabId: 42, title: 'Page' }],
        originalActiveTabs: [],
        pageOutcomes: [{ ordinal: 0, status: 'pending' as const, tabId: 42 }],
        phase: 'running' as const,
        progress: {
          current: 0,
          errors: [],
          message: 'Running',
          phase: 'scanning' as const,
          total: 1,
        },
        revision: 1,
        warnings: [],
      },
      success: true as const,
    })),
    writeClipboardText: vi.fn(),
    ...overrides,
  };
}

it('keeps the start export facade aligned with the owner implementation', () => {
  expect(startPopupExportFacade).toBe(startPopupExportImpl);
});

it('records background job ownership for successful export cancellation', async () => {
  const state = createStartState();
  const deps = createStartDeps();

  await startPopupExportImpl(state, deps);

  expect(state.cancelRetryRef.current).toEqual({
    exportRunId: 'job-1',
    owner: 'job',
    tabIds: [42],
  });
});

it('does not launch either destination before preferences hydrate', async () => {
  const state = createStartState();
  state.hasLoadedPreferences = false;
  const deps = createStartDeps();

  await startPopupExportImpl(state, deps);
  await startPopupExportImpl(state, deps, 'save');

  expect(deps.sendStartJobMessage).not.toHaveBeenCalled();
  expect(state.setProgress).not.toHaveBeenCalled();
});

it('starts Save through the same background job without requesting export-only host access', async () => {
  const state = createStartState();
  state.saveSelection.includePageDiagnostics = true;
  const requestAllUrlsPermission = vi.fn(async () => true);
  const deps = createStartDeps({ requestAllUrlsPermission });

  await startPopupExportImpl(state, deps, 'save');

  expect(requestAllUrlsPermission).not.toHaveBeenCalled();
  expect(deps.sendStartJobMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      intent: 'save',
      options: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: false,
        includeFullPageScreenshot: true,
        includeImages: false,
        includeJson: false,
        includeMarkdown: false,
        includePageDiagnostics: true,
      },
    })
  );
  expect(state.cancelRetryRef.current?.owner).toBe('job');
  expect(state.setLaunchedPlan).toHaveBeenCalledWith(
    expect.objectContaining({
      includeFullPageScreenshot: true,
      includePageDiagnostics: true,
      includeWebCopy: true,
    })
  );
});

it('launches a combined download from the remembered download plan', async () => {
  const state = createStartState();
  state.includeWebCopy = true;
  state.includeJson = true;
  state.includeFiles = true;
  const deps = createStartDeps();

  await startPopupExportImpl(state, deps);

  expect(deps.sendStartJobMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      includeWebCopy: true,
      intent: 'export',
      options: expect.objectContaining({ includeFiles: true, includeJson: true }),
    })
  );
  expect(state.setLaunchedPlan).toHaveBeenCalledWith(
    expect.objectContaining({ includeFiles: true, includeJson: true, includeWebCopy: true })
  );
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({ activeStepKey: 'webSnapshotDom', phase: 'scanning' })
  );
  expect(state.setProgress).toHaveBeenCalledOnce();
  expect(state.setResult).toHaveBeenCalledOnce();
  expect(state.setResult).toHaveBeenCalledWith(null);
});

it('uses the independent Library artifact selection without reading download flags', async () => {
  const state = createStartState();
  state.includeJson = true;
  state.saveSelection = {
    ...state.saveSelection,
    includeJson: false,
    includeMarkdown: true,
  };
  const deps = createStartDeps();

  await startPopupExportImpl(state, deps, 'save');

  expect(deps.sendStartJobMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      includeWebCopy: true,
      intent: 'save',
      options: expect.objectContaining({ includeJson: false, includeMarkdown: true }),
    })
  );
});

it('keeps the job cancellation authority when screenshot permission is declined', async () => {
  const state = createStartState(true);
  const requestAllUrlsPermission = vi.fn(async () => false);
  const deps = createStartDeps({ requestAllUrlsPermission });

  await startPopupExportImpl(state, deps);

  expect(requestAllUrlsPermission).toHaveBeenCalledOnce();
  expect(state.cancelRetryRef.current?.owner).toBe('job');
  expect(deps.sendStartJobMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ includeFullPageScreenshot: false }),
      warnings: expect.arrayContaining([expect.any(String)]),
    })
  );
  expect(state.setLaunchedPlan).toHaveBeenCalledWith(
    expect.objectContaining({ includeFullPageScreenshot: false })
  );
});

it('does not dispatch URL sources when all-sites permission is declined', async () => {
  const state = createStartState();
  state.activeSourceMode = 'urls';
  state.selectedUrls = ['https://example.test/'];
  const requestAllUrlsPermission = vi.fn(async () => false);
  const deps = createStartDeps({ requestAllUrlsPermission });

  await startPopupExportImpl(state, deps);

  expect(requestAllUrlsPermission).toHaveBeenCalledOnce();
  expect(deps.sendStartJobMessage).not.toHaveBeenCalled();
  expect(state.setProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
});

it('normalizes browser titles and caps generated start requests to the contract maximum', async () => {
  const availableTabs = Array.from({ length: 257 }, (_, index) => ({
    disabledReason: null,
    isCurrent: index === 0,
    tabId: index + 1,
    title: index === 0 ? '\ud83d\ude00'.repeat(2_000) : `Page ${index + 1}`,
    url: `https://example.test/${index + 1}`,
  }));
  const state = createPopupExportRuntimeStateFixture({
    availableTabs,
    selectedTabIds: availableTabs.map((tab) => tab.tabId),
    selectedTabIdsInOrder: availableTabs.map((tab) => tab.tabId),
  });
  const deps = createStartDeps();

  await startPopupExportImpl(state, deps);

  const request = vi.mocked(deps.sendStartJobMessage!).mock.calls[0]![0];
  expect(request.sources).toHaveLength(256);
  expect(
    new TextEncoder().encode(request.sources[0]!.kind === 'tab' ? request.sources[0]!.title : '')
      .byteLength
  ).toBeLessThanOrEqual(2 * 1024);
});
