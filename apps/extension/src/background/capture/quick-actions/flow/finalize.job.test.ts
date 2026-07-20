import { beforeEach, expect, it, vi } from 'vitest';
import type { Settings } from '../../../../contracts/settings';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';
import { finalizeQuickActionCapture } from './finalize';

const {
  createRenderedCaptureJob,
  executeDownload,
  openEditorWithImage,
  sendTabMessage,
  transitionCaptureJob,
} = vi.hoisted(() => ({
  createRenderedCaptureJob: vi.fn(),
  executeDownload: vi.fn(),
  openEditorWithImage: vi.fn(),
  sendTabMessage: vi.fn(),
  transitionCaptureJob: vi.fn(),
}));

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging/index')>()),
  sendTabMessage,
}));

vi.mock('../../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download/download-router/index')>()),
  executeDownload,
}));

vi.mock('../../editor/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../editor/index')>()),
  openEditorWithImage,
}));

vi.mock('../../jobs/rendered-job', () => ({
  createRenderedCaptureJob,
}));

vi.mock('../../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../jobs/state-machine')>()),
  transitionCaptureJob,
}));

vi.mock('../../../debugger/session/detach', () => ({
  detachDebugger: vi.fn(),
}));

vi.mock('../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/workspace')>()),
  clearViewport: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  createRenderedCaptureJob.mockResolvedValue('capture-job-created');
  executeDownload.mockResolvedValue(undefined);
  openEditorWithImage.mockResolvedValue(undefined);
  sendTabMessage.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage });
  transitionCaptureJob.mockResolvedValue(undefined);
});

it('passes quick-action capture jobs into download execution', async () => {
  await finalizeQuickActionCapture({
    action: createAction('download_default'),
    captureResult: createCaptureResult(),
    settings: createSettings({ defaultImagePresetId: 'default-preset' }),
    tabId: 7,
  });

  expect(createRenderedCaptureJob).toHaveBeenCalledWith(7);
  expect(executeDownload).toHaveBeenCalledWith(
    'data:image/png;base64,capture',
    'capture.png',
    'download_default',
    'default-preset',
    'capture-job-created'
  );
  expect(transitionCaptureJob).not.toHaveBeenCalledWith('capture-job-created', 'completed');
});

it('marks quick-action inline jobs completed and failed before download ownership', async () => {
  await finalizeQuickActionCapture({
    action: createAction('edit'),
    captureResult: createCaptureResult('capture-job-quick-edit'),
    settings: createSettings(),
    tabId: 8,
  });

  expect(transitionCaptureJob).toHaveBeenCalledWith('capture-job-quick-edit', 'completed', {});

  executeDownload.mockRejectedValueOnce(new Error('download failed'));
  await expect(
    finalizeQuickActionCapture({
      action: createAction('download_default'),
      captureResult: createCaptureResult('capture-job-quick-failed'),
      settings: createSettings(),
      tabId: 9,
    })
  ).rejects.toThrow('download failed');

  expect(transitionCaptureJob).toHaveBeenCalledWith('capture-job-quick-failed', 'failed', {
    error: 'download failed',
  });
});

function createCaptureResult(jobId?: string | undefined) {
  return {
    dataUrl: 'data:image/png;base64,capture',
    filename: 'capture.png',
    ...(jobId === undefined ? {} : { jobId }),
    needsDebugger: false,
  };
}

function createAction(afterCapture: 'download_default' | 'edit') {
  return {
    afterCapture,
    exitAfterCapture: true,
    icon: afterCapture,
    id: `${afterCapture}-action`,
    name: afterCapture,
    screenshotMode: 'visible' as const,
    status: true,
  };
}

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    saveCapturesToGallery: false,
    ...overrides,
  };
}
