// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { useVideoEditorExportEvents } from './export-events';

const {
  getProjectExportOwnerDocumentIdMock,
  subscribeToMessagesMock,
  subscribeToMediaHubEventsMock,
  translateMock,
} = vi.hoisted(() => ({
  getProjectExportOwnerDocumentIdMock: vi.fn(),
  subscribeToMessagesMock: vi.fn(),
  subscribeToMediaHubEventsMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../project/operations/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/operations/export')>()),
  getProjectExportOwnerDocumentId: getProjectExportOwnerDocumentIdMock,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: subscribeToMessagesMock,
  },
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/events')>()),
  subscribeToMediaHubEvents: subscribeToMediaHubEventsMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHook(params: Parameters<typeof useVideoEditorExportEvents>[0]) {
  function Harness() {
    useVideoEditorExportEvents(params);
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
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

function createParams() {
  return {
    getActiveExportJobId: vi.fn((): string | null => 'job-1'),
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

function subscribeWithParams(params = createParams()) {
  renderHook(params);

  return {
    listener: subscribeToMessagesMock.mock.calls[0]?.[0] as
      | ((message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void)
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

it('ignores malformed export messages that only match by type literal', () => {
  const { listener, params } = subscribeWithParams();
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    jobId: 'job-1',
  });

  expect(params.completeExport).not.toHaveBeenCalled();
  expect(params.refreshRecordings).not.toHaveBeenCalled();
  expect(params.refreshProjects).not.toHaveBeenCalled();
});

it('ignores validated runtime messages that are outside the export-event seam', () => {
  const { listener, params } = subscribeWithParams();
  listener?.({
    type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
  });

  expect(params.updateExportStatus).not.toHaveBeenCalled();
  expect(params.failExport).not.toHaveBeenCalled();
  expect(params.completeExport).not.toHaveBeenCalled();
  expect(params.cancelExport).not.toHaveBeenCalled();
});

it('applies owner-scoped completed export messages', () => {
  const { listener, params } = subscribeWithParams();
  const sendResponse = vi.fn();
  listener?.(
    {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      ...createEditorEventTarget(),
      jobId: 'job-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
      exportId: 'export-1',
      filename: 'capture.mp4',
      format: 'mp4',
    },
    undefined,
    sendResponse
  );

  expect(params.completeExport).toHaveBeenCalledWith({
    filename: 'capture.mp4',
    recordingId: 'recording-1',
    exportId: 'export-1',
  });
  expect(params.refreshRecordings).toHaveBeenCalledTimes(1);
  expect(params.refreshProjects).toHaveBeenCalledTimes(1);
  expect(params.refreshProjectExports).toHaveBeenCalledWith('project-1');
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('acknowledges stale owner-scoped export messages without mutating editor state', () => {
  const { listener, params } = subscribeWithParams();
  const sendResponse = vi.fn();

  listener?.(
    {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      ...createEditorEventTarget(),
      jobId: 'job-old',
      projectId: 'project-1',
      recordingId: 'recording-1',
      exportId: 'export-1',
      filename: 'capture.mp4',
      format: 'mp4',
    },
    undefined,
    sendResponse
  );

  expect(params.completeExport).not.toHaveBeenCalled();
  expect(params.refreshRecordings).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('accepts terminal export events after a cancel request failure preserves the job id', () => {
  const { listener, params } = subscribeWithParams();

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
  expect(params.refreshRecordings).toHaveBeenCalledTimes(1);
});

it('ignores validated export messages for stale jobs', () => {
  const { listener, params } = subscribeWithParams();
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    ...createEditorEventTarget(),
    jobId: 'job-old',
    projectId: 'project-1',
    recordingId: 'recording-1',
    exportId: 'export-1',
    filename: 'capture.mp4',
    format: 'mp4',
  });

  expect(params.completeExport).not.toHaveBeenCalled();
  expect(params.refreshRecordings).not.toHaveBeenCalled();
  expect(params.refreshProjects).not.toHaveBeenCalled();
});

it('filters export messages against current authority without resubscribing', () => {
  const { listener, params } = subscribeWithParams();
  params.getActiveExportJobId.mockReturnValue('job-2');

  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    ...createEditorEventTarget(),
    jobId: 'job-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
    exportId: 'export-1',
    filename: 'stale.mp4',
    format: 'mp4',
  });
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    ...createEditorEventTarget(),
    jobId: 'job-2',
    projectId: 'project-1',
    recordingId: 'recording-2',
    exportId: 'export-2',
    filename: 'current.mp4',
    format: 'mp4',
  });
  params.getActiveExportJobId.mockReturnValue(null);
  listener?.({
    type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
    ...createEditorEventTarget(),
    jobId: 'job-2',
    projectId: 'project-1',
    recordingId: 'recording-2',
    exportId: 'export-2',
    filename: 'duplicate.mp4',
    format: 'mp4',
  });

  expect(params.completeExport).toHaveBeenCalledOnce();
  expect(params.completeExport).toHaveBeenCalledWith({
    filename: 'current.mp4',
    recordingId: 'recording-2',
    exportId: 'export-2',
  });
});
