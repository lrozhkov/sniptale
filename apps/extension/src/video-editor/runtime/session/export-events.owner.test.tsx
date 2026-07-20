// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { useVideoEditorExportEvents } from './export-events';

const {
  getProjectExportOwnerDocumentIdMock,
  subscribeToMessagesMock,
  subscribeToMediaHubEventsMock,
} = vi.hoisted(() => ({
  getProjectExportOwnerDocumentIdMock: vi.fn(),
  subscribeToMessagesMock: vi.fn(),
  subscribeToMediaHubEventsMock: vi.fn(),
}));

vi.mock('../../project/operations/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/operations/export')>()),
  getProjectExportOwnerDocumentId: getProjectExportOwnerDocumentIdMock,
}));
vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages: subscribeToMessagesMock },
}));
vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/events')>()),
  subscribeToMediaHubEvents: subscribeToMediaHubEventsMock,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createParams() {
  return {
    getActiveExportJobId: vi.fn(() => 'job-1'),
    projectId: 'project-1',
    setError: vi.fn(),
    updateExportStatus: vi.fn(),
    failExport: vi.fn(),
    completeExport: vi.fn(),
    cancelExport: vi.fn(),
    refreshRecordings: vi.fn().mockResolvedValue(undefined),
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    refreshProjectExports: vi.fn().mockResolvedValue(undefined),
  };
}

function renderHook(params = createParams()) {
  function Harness() {
    useVideoEditorExportEvents(params);
    return null;
  }

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });
  return {
    listener: subscribeToMessagesMock.mock.calls[0]?.[0] as
      | ((message: unknown) => void)
      | undefined,
    params,
  };
}

function createEditorEventTarget() {
  const currentUrl = new URL(window.location.href);
  return {
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: `${currentUrl.origin}${currentUrl.pathname}`,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  getProjectExportOwnerDocumentIdMock.mockReturnValue('editor-doc-1');
  subscribeToMessagesMock.mockReturnValue(() => undefined);
  subscribeToMediaHubEventsMock.mockReturnValue(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  window.history.replaceState(null, '', '/');
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('accepts normalized owner URLs when the editor location has query state', () => {
  window.history.replaceState(null, '', '?project=project-1');
  const { listener, params } = renderHook();
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    ...createEditorEventTarget(),
    jobId: 'job-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    exportId: 'export-1',
    filename: 'capture.mp4',
    format: 'mp4',
  });

  expect(params.completeExport).toHaveBeenCalledWith({
    filename: 'capture.mp4',
    recordingId: 'recording-1',
    exportId: 'export-1',
  });
});

it('ignores same-url export messages for another editor document', () => {
  const { listener, params } = renderHook();
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    ...createEditorEventTarget(),
    targetDocumentId: 'editor-doc-2',
    jobId: 'job-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    exportId: 'export-1',
    filename: 'capture.mp4',
    format: 'mp4',
  });

  expect(params.completeExport).not.toHaveBeenCalled();
});

it('ignores unscoped export failure events', () => {
  const { listener, params } = renderHook();
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_FAILED,
    jobId: 'job-1',
    error: 'interrupted',
  });

  expect(params.failExport).not.toHaveBeenCalled();
});

it('clears running state for owner-scoped interrupted export failures', () => {
  const { listener, params } = renderHook();
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_FAILED,
    ...createEditorEventTarget(),
    jobId: 'job-1',
    error: 'interrupted',
  });

  expect(params.failExport).toHaveBeenCalledWith('interrupted');
});
