import { beforeEach, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  cancelPopupExportMock: vi.fn(),
  copyPopupExportPreviewMock: vi.fn(),
  resetPopupExportViewMock: vi.fn(),
  startPopupExportMock: vi.fn(),
}));

vi.mock('./cancel', () => ({
  cancelPopupExport: actionMocks.cancelPopupExportMock,
}));

vi.mock('./copy', () => ({
  copyPopupExportPreview: actionMocks.copyPopupExportPreviewMock,
}));

vi.mock('./start/execute', () => ({
  startPopupExport: actionMocks.startPopupExportMock,
}));

vi.mock('./reset', () => ({
  resetPopupExportView: actionMocks.resetPopupExportViewMock,
}));

import { createPopupExportRuntimeActions } from './action-factory';

function createState() {
  return {
    requestIdRef: { current: null as string | null },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates action handlers that delegate to the owner-local action seams', async () => {
  const state = createState();
  const deps = {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(),
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    requestAllUrlsPermission: vi.fn(),
    scheduleTimeout: vi.fn(),
    sendCancelJobMessage: vi.fn(),
    sendAckJobStatusMessage: vi.fn(),
    sendGetJobStatusMessage: vi.fn(),
    sendStartJobMessage: vi.fn(),
    writeClipboardText: vi.fn(),
  };

  const actions = createPopupExportRuntimeActions(state as never, deps);

  await actions.handleCopyJson();
  await actions.handleCopyMarkdown();
  await actions.handleStartExport();
  await actions.handleSaveWebSnapshot();
  await actions.handleCancelExport();
  await actions.handleResetExportView();

  expect(actionMocks.copyPopupExportPreviewMock).toHaveBeenNthCalledWith(1, state, 'json', deps);
  expect(actionMocks.copyPopupExportPreviewMock).toHaveBeenNthCalledWith(
    2,
    state,
    'markdown',
    deps
  );
  expect(actionMocks.startPopupExportMock).toHaveBeenNthCalledWith(1, state, deps);
  expect(actionMocks.startPopupExportMock).toHaveBeenNthCalledWith(2, state, deps, 'save');
  expect(actionMocks.cancelPopupExportMock).toHaveBeenCalledWith(state, deps);
  expect(actionMocks.resetPopupExportViewMock).toHaveBeenCalledWith(state, deps);
});
