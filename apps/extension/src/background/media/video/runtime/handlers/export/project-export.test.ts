import { beforeEach, expect, it, vi } from 'vitest';

const {
  ensureOffscreenDocumentMock,
  hasOffscreenDocumentMock,
  loadActiveLedgerMock,
  loadProjectExportInputMock,
  markTerminalMock,
  requestCancelMock,
  reserveLedgerMock,
  sendRuntimeMessageMock,
  waitForOffscreenReadyMock,
} = vi.hoisted(() => ({
  ensureOffscreenDocumentMock: vi.fn(),
  hasOffscreenDocumentMock: vi.fn(),
  loadActiveLedgerMock: vi.fn(),
  loadProjectExportInputMock: vi.fn(),
  markTerminalMock: vi.fn(),
  requestCancelMock: vi.fn(),
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
      void work
        .then((response) => sendResponse(response))
        .catch((error: unknown) =>
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        )
  ),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
  markProjectExportJobTerminal: markTerminalMock,
  requestProjectExportJobCancel: requestCancelMock,
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

import { handleCancelProjectExport, handleStartProjectExport } from './project-export';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  consumeProjectExportCancelCapability,
  resetProjectExportRuntimeCapabilitiesForTests,
} from '../../export-capabilities';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const VIDEO_EDITOR_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';
const VIDEO_EDITOR_OWNER = { documentId: 'editor-doc-1', senderUrl: VIDEO_EDITOR_URL };

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
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
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
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
  resetProjectExportRuntimeCapabilitiesForTests();
  installBackgroundRuntimeMessagingMock({ sendRuntimeMessage: sendRuntimeMessageMock });
  hasOffscreenDocumentMock.mockReturnValue(true);
  ensureOffscreenDocumentMock.mockResolvedValue(false);
  loadActiveLedgerMock.mockResolvedValue(null);
  markTerminalMock.mockResolvedValue(null);
  requestCancelMock.mockResolvedValue(null);
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  reserveLedgerMock.mockResolvedValue(null);
  waitForOffscreenReadyMock.mockResolvedValue(undefined);
});

it('starts project export through the offscreen transport', async () => {
  const sendResponse = createSendResponse();
  const settings = createExportSettings();

  expect(
    handleStartProjectExport(
      { input: createInputReference(), jobId: 'job-1', settings },
      sendResponse,
      VIDEO_EDITOR_OWNER
    )
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      capabilityToken: expect.any(String),
      input: createInputReference(),
      jobId: 'job-1',
      settings,
    })
  );
  expect(reserveLedgerMock).toHaveBeenCalledWith({
    jobId: 'job-1',
    ownerDocumentId: 'editor-doc-1',
    ownerSenderUrl: VIDEO_EDITOR_URL,
    projectId: 'project-1',
  });
  expect(waitForOffscreenReadyMock).toHaveBeenCalledTimes(1);
  const response = sendResponse.mock.calls[0]?.[0] as { capabilityToken?: string };
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    jobId: 'job-1',
    capabilityToken: expect.any(String),
    ownerDocumentId: 'editor-doc-1',
  });
  expect(
    await consumeProjectExportCancelCapability({
      documentId: 'editor-doc-1',
      jobId: 'job-1',
      senderUrl: VIDEO_EDITOR_URL,
      token: response.capabilityToken ?? '',
    })
  ).toBe(true);
});

it('acks project export cancellation through the offscreen transport', async () => {
  const sendResponse = createSendResponse();

  expect(handleCancelProjectExport({ jobId: 'job-2' }, sendResponse)).toEqual({
    handled: true,
    keepChannelOpen: true,
  });
  await flushPromises();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
      capabilityToken: expect.any(String),
      jobId: 'job-2',
    })
  );
  expect(requestCancelMock).toHaveBeenCalledWith('job-2');
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    jobId: 'job-2',
    result: 'accepted',
  });
});
