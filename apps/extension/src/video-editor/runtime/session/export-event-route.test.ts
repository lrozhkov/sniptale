// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  routeProjectExportRuntimeEvent,
  type ProjectExportEventHandlers,
} from './export-event-route';

const { getProjectExportOwnerDocumentIdMock, translateMock } = vi.hoisted(() => ({
  getProjectExportOwnerDocumentIdMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../project/operations/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/operations/export')>()),
  getProjectExportOwnerDocumentId: getProjectExportOwnerDocumentIdMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getProjectExportOwnerDocumentIdMock.mockReturnValue('editor-doc-1');
  window.history.replaceState(null, '', '/apps/extension/src/video-editor/index.html');
});

function createHandlers(): ProjectExportEventHandlers {
  return {
    cancelExport: vi.fn(),
    completeExport: vi.fn(),
    failExport: vi.fn(),
    refreshProjectExports: vi.fn().mockResolvedValue(undefined),
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    refreshRecordings: vi.fn().mockResolvedValue(undefined),
    updateExportStatus: vi.fn(),
  };
}

function createEditorEventTarget() {
  const currentUrl = new URL(window.location.href);
  return {
    targetDocumentId: 'editor-doc-1',
    targetSenderUrl: `${currentUrl.origin}${currentUrl.pathname}`,
  };
}

it('routes owner-scoped completed export messages and returns a runtime ack', () => {
  const handlers = createHandlers();

  const response = routeProjectExportRuntimeEvent(
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
    handlers,
    () => 'job-1'
  );

  expect(response).toEqual({ success: true, result: 'accepted' });
  expect(handlers.completeExport).toHaveBeenCalledWith({
    filename: 'capture.mp4',
    recordingId: 'recording-1',
    exportId: 'export-1',
  });
  expect(handlers.refreshRecordings).toHaveBeenCalledOnce();
  expect(handlers.refreshProjects).toHaveBeenCalledOnce();
  expect(handlers.refreshProjectExports).toHaveBeenCalledWith('project-1');
});

it('acknowledges stale export messages without mutating editor state', () => {
  const handlers = createHandlers();

  const response = routeProjectExportRuntimeEvent(
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
    handlers,
    () => 'job-1'
  );

  expect(response).toEqual({ success: true, result: 'accepted' });
  expect(handlers.completeExport).not.toHaveBeenCalled();
  expect(handlers.refreshRecordings).not.toHaveBeenCalled();
});

it('ignores completion after cancellation clears active export authority', () => {
  const handlers = createHandlers();

  const response = routeProjectExportRuntimeEvent(
    {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      ...createEditorEventTarget(),
      jobId: 'job-cancelled',
      projectId: 'project-1',
      recordingId: 'recording-1',
      exportId: 'export-1',
      filename: 'cancelled.mp4',
      format: 'mp4',
    },
    handlers,
    () => null
  );

  expect(response).toEqual({ success: true, result: 'accepted' });
  expect(handlers.completeExport).not.toHaveBeenCalled();
  expect(handlers.refreshRecordings).not.toHaveBeenCalled();
});

it('ignores malformed export messages without claiming a response contract', () => {
  const handlers = createHandlers();

  expect(
    routeProjectExportRuntimeEvent(
      {
        type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
        jobId: 'job-1',
      },
      handlers,
      () => 'job-1'
    )
  ).toBeNull();
  expect(handlers.completeExport).not.toHaveBeenCalled();
});
