import { beforeEach, expect, it, vi } from 'vitest';

import { createProjectExportService } from './index';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';

const {
  canUsePassthroughPathMock,
  cleanupJobMock,
  exportPassthroughMock,
  loadActiveLedgerMock,
  loadImagesForProjectMock,
  markTerminalMock,
  renderCompositeExportMock,
  requestCancelMock,
  sendProgressMock,
  sendRuntimeMessageBestEffortMock,
  upsertLedgerMock,
} = vi.hoisted(() => ({
  canUsePassthroughPathMock: vi.fn(),
  cleanupJobMock: vi.fn(),
  exportPassthroughMock: vi.fn(),
  loadActiveLedgerMock: vi.fn(),
  loadImagesForProjectMock: vi.fn(),
  markTerminalMock: vi.fn(),
  renderCompositeExportMock: vi.fn(),
  requestCancelMock: vi.fn(),
  sendProgressMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
  upsertLedgerMock: vi.fn(),
}));

vi.mock('../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime')>()),
  cleanupJob: cleanupJobMock,
  sendProgress: sendProgressMock,
}));

vi.mock('../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media')>()),
  loadImagesForProject: loadImagesForProjectMock,
}));

vi.mock('../render', () => ({
  canUsePassthroughPath: canUsePassthroughPathMock,
  exportPassthrough: exportPassthroughMock,
  renderCompositeExport: renderCompositeExportMock,
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));

vi.mock('../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/export-ledger')>()),
  loadActiveProjectExportJobLedgerEntry: loadActiveLedgerMock,
  markProjectExportJobTerminal: markTerminalMock,
  requestProjectExportJobCancel: requestCancelMock,
  upsertProjectExportJobLedgerEntry: upsertLedgerMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  canUsePassthroughPathMock.mockReturnValue(false);
  exportPassthroughMock.mockResolvedValue(undefined);
  loadActiveLedgerMock.mockResolvedValue(null);
  loadImagesForProjectMock.mockResolvedValue(new Map());
  markTerminalMock.mockResolvedValue(null);
  renderCompositeExportMock.mockResolvedValue(undefined);
  requestCancelMock.mockResolvedValue(null);
  sendProgressMock.mockResolvedValue(undefined);
  sendRuntimeMessageBestEffortMock.mockReturnValue(undefined);
  upsertLedgerMock.mockImplementation((input: unknown) => Promise.resolve(input));
});

it('aborts the active job before waiting for cancel ledger persistence', async () => {
  const service = createProjectExportService();
  let resolvePreparingProgress: () => void = () => undefined;
  let resolveCancelLedgerWrite: () => void = () => undefined;

  sendProgressMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolvePreparingProgress = resolve;
    })
  );
  requestCancelMock.mockReturnValueOnce(
    new Promise<null>((resolve) => {
      resolveCancelLedgerWrite = () => resolve(null);
    })
  );

  const startPromise = service.startProjectExport(
    'job-pending-cancel-ledger',
    createEmptyVideoProject('Pending cancel', 1280, 720),
    createSettings()
  );
  await flushPromises();
  const cancelPromise = service.cancelProjectExport('job-pending-cancel-ledger');
  await flushPromises();

  resolvePreparingProgress();
  await flushPromises();

  expect(canUsePassthroughPathMock).not.toHaveBeenCalled();
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        jobId: 'job-pending-cancel-ledger',
        type: 'PROJECT_EXPORT_CANCELLED',
      }),
    })
  );

  resolveCancelLedgerWrite();
  await cancelPromise;
  await startPromise;
});
