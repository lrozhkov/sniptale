import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureOffscreenDocumentMock,
  hasOffscreenDocumentMock,
  loadProjectExportInputMock,
  reserveLedgerMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  ensureOffscreenDocumentMock: vi.fn(),
  hasOffscreenDocumentMock: vi.fn(),
  loadProjectExportInputMock: vi.fn(),
  reserveLedgerMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  waitForOffscreenReadyMock: vi.fn(),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));
vi.mock('../../../../../routing-contracts/response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../routing-contracts/response')>()),
  respondAsyncRouteWithLogger: vi.fn(
    ({
      work,
      sendResponse,
    }: {
      work: Promise<unknown>;
      sendResponse: (response?: unknown) => void;
    }) =>
      void work.catch((error: unknown) =>
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
          success: false,
        })
      )
  ),
}));
vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  reserveProjectExportJobLedgerEntry: reserveLedgerMock,
}));
vi.mock(
  '../../../../../../composition/persistence/project-export-inputs',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../../composition/persistence/project-export-inputs')
    >()),
    deleteProjectExportInput: vi.fn(async () => undefined),
    loadProjectExportInput: loadProjectExportInputMock,
  })
);
vi.mock('../../offscreen-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offscreen-manager')>()),
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  hasOffscreenDocument: hasOffscreenDocumentMock,
  waitForOffscreenReady: waitForOffscreenReadyMock,
}));
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleStartProjectExport } from './project-export';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_OWNER = { documentId: 'editor-doc-1', senderUrl: VIDEO_EDITOR_URL };

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createProject(): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [],
    createdAt: 1,
    cursorTrack: null,
    duration: 10,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    tracks: [],
    updatedAt: 1,
    version: 2,
    width: 1280,
  };
}

function createInputReference() {
  return {
    contentSha256: `sha256:${'a'.repeat(64)}`,
    jobId: 'job-1',
    projectId: 'project-1',
    retainedByteLength: 3 * 1024 * 1024,
  };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  loadProjectExportInputMock.mockResolvedValue(createProject());
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  hasOffscreenDocumentMock.mockReturnValue(true);
  reserveLedgerMock.mockRejectedValue(new Error('Project export is already running'));
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
});

it('rejects start attempts that would overwrite a running job owner', async () => {
  const sendResponse = createSendResponse();
  const settings = createExportSettings();

  handleStartProjectExport(
    { input: createInputReference(), jobId: 'job-1', settings },
    sendResponse,
    VIDEO_EDITOR_OWNER
  );
  await flushPromises();

  expect(reserveLedgerMock).toHaveBeenCalledWith({
    jobId: 'job-1',
    ownerDocumentId: VIDEO_EDITOR_OWNER.documentId,
    ownerSenderUrl: VIDEO_EDITOR_OWNER.senderUrl,
    projectId: 'project-1',
  });
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    input: createInputReference(),
    jobId: 'job-1',
    settings,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Project export is already running',
    success: false,
  });
});
