import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chooseSource: vi.fn(),
  createJob: vi.fn(),
  acquireMutationPermit: vi.fn(),
  ensureOffscreen: vi.fn(),
  executeDownload: vi.fn(),
  openEditor: vi.fn(),
  runtimeSend: vi.fn(),
  saveAsset: vi.fn(),
  transitionJob: vi.fn(),
  waitOffscreen: vi.fn(),
}));

vi.mock('../../../media/desktop-capture/source-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media/desktop-capture/source-picker')>()),
  chooseDesktopScreenshotSource: mocks.chooseSource,
}));
vi.mock('../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensureOffscreen,
  waitForOffscreenReady: mocks.waitOffscreen,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.runtimeSend }),
}));
vi.mock('../../../media-hub/assets', () => ({
  saveScreenshotToMediaHubFromDataUrl: mocks.saveAsset,
}));
vi.mock('../../download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download/download-router')>()),
  executeDownload: mocks.executeDownload,
}));
vi.mock('../../editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../editor')>()),
  openEditorWithImage: mocks.openEditor,
}));
vi.mock('../../jobs/rendered-job', () => ({ createRenderedCaptureJob: mocks.createJob }));
vi.mock('../../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../jobs/state-machine')>()),
  transitionCaptureJob: mocks.transitionJob,
}));
vi.mock('../../../mutation-exclusion/media-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../mutation-exclusion/media-activity')>()),
  acquireMediaMutationPermit: mocks.acquireMutationPermit,
}));
vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: unknown) => message,
}));

import { runDesktopQuickAction } from './workflow';
import { DEFAULT_SETTINGS } from '../../../../composition/persistence/settings';
import type { CaptureActionType, QuickAction } from '../../../../contracts/settings';
import type { QuickActionRuntimeContext } from '../flow/shared';

function createContext(
  afterCapture: CaptureActionType = 'download_default'
): QuickActionRuntimeContext {
  const action: QuickAction = {
    afterCapture,
    bundledId: null,
    delay: null,
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Monitor',
    id: 'desktop-action',
    imageFormat: afterCapture === 'copy' ? 'png' : 'webp',
    imageQuality: afterCapture === 'copy' ? null : 80,
    name: 'Desktop capture',
    origin: 'user',
    screenshotMode: 'desktop',
    status: true,
    viewportPresetId: null,
  };
  return {
    action,
    afterCapture,
    captureMode: 'desktop',
    delaySeconds: 0,
    imageFormat: afterCapture === 'copy' ? 'png' : 'webp',
    imageQuality: 80,
    settings: { ...DEFAULT_SETTINGS, defaultImagePresetId: 'default-preset' },
    viewportPresetId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireMutationPermit.mockReturnValue(vi.fn());
  mocks.chooseSource.mockResolvedValue({
    status: 'selected',
    selection: { label: 'Window', streamId: 'one-shot-stream' },
  });
  mocks.createJob.mockResolvedValue('job-1');
  mocks.runtimeSend.mockResolvedValue({
    success: true,
    result: 'captured',
    dataUrl: 'data:image/webp;base64,AA==',
    width: 1280,
    height: 720,
  });
  mocks.saveAsset.mockResolvedValue('asset-1');
  mocks.executeDownload.mockResolvedValue(undefined);
  mocks.openEditor.mockResolvedValue(undefined);
  mocks.transitionJob.mockResolvedValue(undefined);
});

it('prepares offscreen before opening the picker and cancels without a job or asset', async () => {
  const order: string[] = [];
  mocks.ensureOffscreen.mockImplementation(async () => order.push('ensure'));
  mocks.waitOffscreen.mockImplementation(async () => order.push('ready'));
  mocks.chooseSource.mockImplementation(async () => {
    order.push('picker');
    return { status: 'cancelled' };
  });

  await expect(runDesktopQuickAction({ context: createContext(), tabId: 7 })).resolves.toEqual({
    result: 'cancelled',
  });

  expect(order).toEqual(['ensure', 'ready', 'picker']);
  expect(mocks.createJob).not.toHaveBeenCalled();
  expect(mocks.runtimeSend).not.toHaveBeenCalled();
  expect(mocks.saveAsset).not.toHaveBeenCalled();
});

it('fails closed when privacy erasure owns the media mutation exclusion', async () => {
  mocks.acquireMutationPermit.mockReturnValueOnce(null);

  await expect(runDesktopQuickAction({ context: createContext(), tabId: 8 })).rejects.toThrow(
    'Local data erasure is in progress'
  );
  expect(mocks.ensureOffscreen).not.toHaveBeenCalled();
});

it('surfaces picker acquisition failures without creating a capture job', async () => {
  mocks.chooseSource.mockResolvedValueOnce({ status: 'failed', error: 'picker failed' });

  await expect(runDesktopQuickAction({ context: createContext(), tabId: 8 })).rejects.toThrow(
    'picker failed'
  );
  expect(mocks.createJob).not.toHaveBeenCalled();
});

it('consumes the one-shot stream immediately while capture-job creation is pending', async () => {
  let resolveJob: ((value: string) => void) | undefined;
  mocks.createJob.mockReturnValue(
    new Promise<string>((resolve) => {
      resolveJob = resolve;
    })
  );

  const result = runDesktopQuickAction({ context: createContext(), tabId: 9 });
  await vi.waitFor(() => expect(mocks.runtimeSend).toHaveBeenCalledOnce());
  expect(mocks.runtimeSend).toHaveBeenCalledWith(
    expect.objectContaining({ streamId: 'one-shot-stream', imageFormat: 'webp' })
  );
  resolveJob?.('job-1');

  await expect(result).resolves.toEqual({ result: 'accepted' });
  expect(mocks.executeDownload).toHaveBeenCalledWith(
    'data:image/webp;base64,AA==',
    expect.stringContaining('_desktop.'),
    'download_default',
    'default-preset',
    'job-1'
  );
});

it.each([
  ['edit', 'temporary'],
  ['copy', 'temporary'],
  ['save_to_library', 'library'],
] as const)('delivers %s through its canonical owner', async (afterCapture, assetClass) => {
  if (afterCapture === 'copy') {
    mocks.runtimeSend
      .mockResolvedValueOnce({
        success: true,
        result: 'captured',
        dataUrl: 'data:image/png;base64,AA==',
        width: 1280,
        height: 720,
      })
      .mockResolvedValueOnce({ success: true, result: 'copied' });
  }

  await expect(
    runDesktopQuickAction({ context: createContext(afterCapture), tabId: 11 })
  ).resolves.toEqual({ result: 'accepted' });

  expect(mocks.saveAsset).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    undefined,
    assetClass
  );
  if (afterCapture === 'edit') {
    expect(mocks.openEditor).toHaveBeenCalledWith(expect.any(String), {
      assetId: 'asset-1',
      title: null,
      url: null,
    });
  }
  if (afterCapture === 'copy') {
    expect(mocks.runtimeSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'OFFSCREEN_WRITE_IMAGE_CLIPBOARD',
        dataUrl: 'data:image/png;base64,AA==',
      })
    );
  }
  expect(mocks.transitionJob).toHaveBeenCalledWith('job-1', 'completed');
});

it('routes Save As without a preset so the download owner requests the system dialog', async () => {
  await runDesktopQuickAction({ context: createContext('ask_system'), tabId: 12 });

  expect(mocks.executeDownload).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining('_desktop.'),
    'ask_system',
    undefined,
    'job-1'
  );
});

it('marks the capture job failed when a downstream sink rejects', async () => {
  mocks.executeDownload.mockRejectedValueOnce(new Error('download failed'));

  await expect(runDesktopQuickAction({ context: createContext(), tabId: 13 })).rejects.toThrow(
    'download failed'
  );

  expect(mocks.transitionJob).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'download failed',
  });
});

it('marks an already-created job failed when offscreen capture rejects', async () => {
  mocks.runtimeSend.mockResolvedValueOnce({ success: false, error: 'frame failed' });

  await expect(runDesktopQuickAction({ context: createContext(), tabId: 14 })).rejects.toThrow(
    'frame failed'
  );

  expect(mocks.transitionJob).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'frame failed',
  });
});

it('waits for a pending job and fails it when offscreen capture rejects first', async () => {
  const releaseMutationPermit = vi.fn();
  let resolveJob: ((value: string) => void) | undefined;
  mocks.acquireMutationPermit.mockReturnValueOnce(releaseMutationPermit);
  mocks.createJob.mockReturnValueOnce(
    new Promise<string>((resolve) => {
      resolveJob = resolve;
    })
  );
  mocks.runtimeSend.mockResolvedValueOnce({ success: false, error: 'early frame failure' });

  const result = runDesktopQuickAction({ context: createContext(), tabId: 16 });
  await vi.waitFor(() => expect(mocks.runtimeSend).toHaveBeenCalledOnce());
  await Promise.resolve();
  expect(releaseMutationPermit).not.toHaveBeenCalled();
  expect(mocks.transitionJob).not.toHaveBeenCalled();

  resolveJob?.('late-job');
  await expect(result).rejects.toThrow('early frame failure');
  expect(mocks.transitionJob).toHaveBeenCalledWith('late-job', 'failed', {
    error: 'early frame failure',
  });
  expect(releaseMutationPermit).toHaveBeenCalledOnce();
});

it('holds the mutation permit until offscreen capture settles after job creation fails', async () => {
  const releaseMutationPermit = vi.fn();
  let resolveCapture:
    | ((value: {
        success: true;
        result: 'captured';
        dataUrl: string;
        width: number;
        height: number;
      }) => void)
    | undefined;
  mocks.acquireMutationPermit.mockReturnValueOnce(releaseMutationPermit);
  mocks.createJob.mockRejectedValueOnce(new Error('job creation failed'));
  mocks.runtimeSend.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCapture = resolve;
    })
  );

  const result = runDesktopQuickAction({ context: createContext(), tabId: 17 });
  await vi.waitFor(() => expect(mocks.runtimeSend).toHaveBeenCalledOnce());
  await Promise.resolve();
  expect(releaseMutationPermit).not.toHaveBeenCalled();

  resolveCapture?.({
    success: true,
    result: 'captured',
    dataUrl: 'data:image/webp;base64,AA==',
    width: 1280,
    height: 720,
  });
  await expect(result).rejects.toThrow('job creation failed');
  expect(mocks.transitionJob).not.toHaveBeenCalled();
  expect(releaseMutationPermit).toHaveBeenCalledOnce();
});

it('rejects clipboard owner failures and marks the job failed', async () => {
  mocks.runtimeSend
    .mockResolvedValueOnce({
      success: true,
      result: 'captured',
      dataUrl: 'data:image/png;base64,AA==',
      width: 1280,
      height: 720,
    })
    .mockResolvedValueOnce({ success: false, error: 'clipboard failed' });

  await expect(
    runDesktopQuickAction({ context: createContext('copy'), tabId: 15 })
  ).rejects.toThrow('clipboard failed');
  expect(mocks.transitionJob).toHaveBeenLastCalledWith('job-1', 'failed', {
    error: 'clipboard failed',
  });
});
