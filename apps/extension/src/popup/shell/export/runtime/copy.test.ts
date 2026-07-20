import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPreviewToCopyMock: vi.fn(() => 'copied-preview'),
  logPopupExportCopyFailureMock: vi.fn(),
  scheduleCopiedFormatResetMock: vi.fn(),
}));

vi.mock('./copied-format', () => ({
  scheduleCopiedFormatReset: mocks.scheduleCopiedFormatResetMock,
}));
vi.mock('./logging', () => ({
  logPopupExportCopyFailure: mocks.logPopupExportCopyFailureMock,
}));
vi.mock('./preview-to-copy', () => ({
  getPopupExportPreviewToCopy: mocks.getPreviewToCopyMock,
}));

import { copyPopupExportPreview } from './copy';

function createState() {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    copyRequestIdRef: { current: 0 },
    exportDisabledReason: null,
    setCopyingFormat: vi.fn(),
  };
}

function createDeps() {
  return {
    getActiveTabId: vi.fn(async () => 7),
    requestPreview: vi.fn(async () => ({ markdown: 'preview' })),
    writeClipboardText: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPreviewToCopyMock.mockReturnValue('copied-preview');
});

it('returns early when the requested active-tab preview is unavailable', async () => {
  const state = { ...createState(), canCopyMarkdown: false };
  const deps = createDeps();

  await copyPopupExportPreview(state as never, 'markdown', deps as never);

  expect(state.setCopyingFormat).not.toHaveBeenCalled();
  expect(deps.getActiveTabId).not.toHaveBeenCalled();
});

it('still allows copying the current tab when batch export is disabled for page selection', async () => {
  const state = { ...createState(), exportDisabledReason: 'disabled' };
  const deps = createDeps();

  await copyPopupExportPreview(state as never, 'markdown', deps as never);

  expect(state.setCopyingFormat).toHaveBeenNthCalledWith(1, 'markdown');
  expect(deps.getActiveTabId).toHaveBeenCalledOnce();
});

it('copies the selected preview, schedules reset, and clears the copying state', async () => {
  const state = createState();
  const deps = createDeps();

  await copyPopupExportPreview(state as never, 'markdown', deps as never);

  expect(state.setCopyingFormat).toHaveBeenNthCalledWith(1, 'markdown');
  expect(deps.getActiveTabId).toHaveBeenCalledOnce();
  expect(deps.requestPreview).toHaveBeenCalledWith(7, 'popup.export.prepareExportError');
  expect(deps.writeClipboardText).toHaveBeenCalledWith('copied-preview');
  expect(mocks.scheduleCopiedFormatResetMock).toHaveBeenCalledWith(state, 'markdown', deps);
  expect(state.setCopyingFormat).toHaveBeenLastCalledWith(null);
});

it('skips stale copy completions and logs current-request failures', async () => {
  const state = createState();
  const deps = createDeps();
  deps.requestPreview.mockImplementation(async () => {
    state.copyRequestIdRef.current = 999;
    return { markdown: 'preview' };
  });

  await copyPopupExportPreview(state as never, 'markdown', deps as never);
  expect(deps.writeClipboardText).not.toHaveBeenCalled();
  expect(mocks.scheduleCopiedFormatResetMock).not.toHaveBeenCalled();

  const failingState = createState();
  const failingDeps = createDeps();
  failingDeps.writeClipboardText.mockRejectedValue(new Error('clipboard denied'));

  await copyPopupExportPreview(failingState as never, 'json', failingDeps as never);
  expect(mocks.logPopupExportCopyFailureMock).toHaveBeenCalled();
  expect(failingState.setCopyingFormat).toHaveBeenLastCalledWith(null);
});
