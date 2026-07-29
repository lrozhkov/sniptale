import { expect, it, vi } from 'vitest';

const restorePinnedToolbarAfterNavigation = vi.hoisted(() => vi.fn(async () => true));
const invalidatePinnedToolbarOperations = vi.hoisted(() => vi.fn());

vi.mock('../../page-access/pinned-toolbar-restore', () => ({
  restorePinnedToolbarAfterNavigation,
}));

vi.mock('../../page-access/pinned-toolbar-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/pinned-toolbar-operation')>()),
  invalidatePinnedToolbarOperations,
}));

import {
  cleanupScreenshotModeAfterNavigation,
  handleTabNavigation,
  handleExportHarNavigationStart,
  ensureActiveVideoRecordingLeaseHydrated,
  handleRegionSelectionNavigationStart,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
  navigationCommittedListenerRef,
  navigationCompletedListenerRef,
  navigationErrorListenerRef,
  navigationListenerRef,
  parseTopLevelDocumentNavigation,
  parseTopLevelNavigation,
  updatedListenerRef,
  createModeState,
  flushMicrotasks,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerNavigationListeners } from './navigation';

it('hydrates the persisted recording lease before routing tab and navigation events', async () => {
  const state = createModeState();

  registerNavigationListeners(state);

  updatedListenerRef.current?.(7, { status: 'loading' }, {
    url: 'https://example.com',
  } as chrome.tabs.Tab);
  updatedListenerRef.current?.(7, { status: 'complete' }, {
    url: 'https://example.com',
  } as chrome.tabs.Tab);
  await flushMicrotasks();

  expect(handleTabNavigation).toHaveBeenCalledWith(7, 'https://example.com');
  expect(ensureActiveVideoRecordingLeaseHydrated).not.toHaveBeenCalled();
  expect(restorePinnedToolbarAfterNavigation).toHaveBeenCalledWith(7, state);

  navigationListenerRef.current?.({ frameId: 3, tabId: 7 });
  expect(handleTabRecordingNavigationStart).not.toHaveBeenCalled();

  parseTopLevelNavigation.mockReturnValue({ frameId: 0, tabId: 7 });
  navigationListenerRef.current?.({ frameId: 0, tabId: 7 });
  await flushMicrotasks();
  expect(invalidatePinnedToolbarOperations).toHaveBeenCalledWith(7);
  expect(state.highlighterModeState.has(7)).toBe(false);
  expect(state.quickEditModeState.has(7)).toBe(false);
  expect(cleanupScreenshotModeAfterNavigation).toHaveBeenCalledWith(
    7,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts
  );
  expect(handleRegionSelectionNavigationStart).toHaveBeenCalledWith(7);
  expect(handleExportHarNavigationStart).toHaveBeenCalledWith(7);
  expect(handleTabRecordingNavigationStart).toHaveBeenCalledWith(7);

  parseTopLevelDocumentNavigation.mockReturnValue({
    documentId: 'document-1',
    frameId: 0,
    tabId: 7,
  });
  navigationCommittedListenerRef.current?.({ documentId: 'document-1', frameId: 0, tabId: 7 });
  navigationCompletedListenerRef.current?.({ documentId: 'document-1', frameId: 0, tabId: 7 });
  navigationErrorListenerRef.current?.({ documentId: 'document-1', frameId: 0, tabId: 7 });
  await flushMicrotasks();
  expect(handleTabRecordingNavigationCommitted).toHaveBeenCalledWith(7, 'document-1');
  expect(handleTabRecordingNavigationCompleted).toHaveBeenCalledWith(
    7,
    'document-1',
    expect.any(Function)
  );
  expect(handleTabRecordingNavigationError).toHaveBeenCalledWith(
    7,
    'document-1',
    expect.any(Function)
  );
});

it('retries an unhandled completion after worker lease hydration', async () => {
  let finishHydration!: () => void;
  ensureActiveVideoRecordingLeaseHydrated.mockReturnValueOnce(
    new Promise((resolve) => {
      finishHydration = () => resolve(null);
    })
  );
  handleTabRecordingNavigationCompleted.mockReturnValueOnce(false).mockReturnValueOnce(true);
  registerNavigationListeners(createModeState());

  parseTopLevelDocumentNavigation.mockReturnValue({
    documentId: 'document-1',
    frameId: 0,
    tabId: 7,
  });
  navigationCompletedListenerRef.current?.({ documentId: 'document-1', frameId: 0, tabId: 7 });
  await flushMicrotasks();
  expect(handleTabRecordingNavigationCompleted).toHaveBeenCalledOnce();

  finishHydration();
  await flushMicrotasks();
  expect(handleTabRecordingNavigationCompleted).toHaveBeenCalledTimes(2);
  expect(handleTabRecordingNavigationCompleted).toHaveBeenLastCalledWith(
    7,
    'document-1',
    expect.any(Function)
  );
});

it('routes an active navigation start before asynchronous lease hydration', async () => {
  let finishHydration: (() => void) | undefined;
  ensureActiveVideoRecordingLeaseHydrated.mockReturnValueOnce(
    new Promise((resolve) => {
      finishHydration = () => resolve(null);
    })
  );
  handleTabRecordingNavigationStart.mockReturnValueOnce(true);
  registerNavigationListeners(createModeState());
  parseTopLevelNavigation.mockReturnValue({ frameId: 0, tabId: 7 });

  navigationListenerRef.current?.({ frameId: 0, tabId: 7 });
  const callsBeforeHydration = handleTabRecordingNavigationStart.mock.calls.length;

  finishHydration?.();
  await flushMicrotasks();
  expect(callsBeforeHydration).toBe(1);
  expect(handleTabRecordingNavigationStart).toHaveBeenCalledOnce();
  expect(ensureActiveVideoRecordingLeaseHydrated).not.toHaveBeenCalled();
});
