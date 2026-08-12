import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireMutationPermit: vi.fn(),
  createJob: vi.fn(),
  executeDownload: vi.fn(),
  ensureOffscreen: vi.fn(),
  openEditor: vi.fn(),
  releasePermit: vi.fn(),
  saveAsset: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  transitionJob: vi.fn(),
  waitOffscreen: vi.fn(),
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
vi.mock('../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensureOffscreen,
  waitForOffscreenReady: mocks.waitOffscreen,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
import { reserveDesktopQuickAction, runDesktopQuickAction } from './workflow';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { DEFAULT_SETTINGS } from '../../../../composition/persistence/settings';
import type { CaptureActionType, QuickAction } from '../../../../contracts/settings';
import type { QuickActionRuntimeContext } from '../flow/shared';

function createContext(
  afterCapture: CaptureActionType = 'download_default'
): QuickActionRuntimeContext {
  const imageFormat = afterCapture === 'copy' ? 'png' : 'webp';
  const action: QuickAction = {
    afterCapture,
    bundledId: null,
    delay: null,
    exitAfterCapture: false,
    hotkey: null,
    icon: 'Monitor',
    id: 'desktop-action',
    imageFormat,
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
    imageFormat,
    imageQuality: 80,
    settings: { ...DEFAULT_SETTINGS, defaultImagePresetId: 'default-preset' },
    viewportPresetId: null,
  };
}

function createDataUrl(afterCapture: CaptureActionType = 'download_default') {
  const mimeType = afterCapture === 'copy' ? 'png' : 'webp';
  return `data:image/${mimeType};base64,AA==`;
}

async function runPrepared(context: QuickActionRuntimeContext, tabId: number) {
  const preparation = await reserveDesktopQuickAction({ context, tabId });
  return runDesktopQuickAction({
    context,
    desktopSelection: {
      ...preparation,
      status: 'selected',
      dataUrl: createDataUrl(context.afterCapture),
      width: 1200,
      height: 800,
    },
    tabId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.releasePermit.mockReset();
  mocks.acquireMutationPermit.mockReturnValue(mocks.releasePermit);
  mocks.createJob.mockResolvedValue('job-1');
  mocks.saveAsset.mockResolvedValue('asset-1');
  mocks.executeDownload.mockResolvedValue(undefined);
  mocks.openEditor.mockResolvedValue(undefined);
  mocks.transitionJob.mockResolvedValue(undefined);
  mocks.ensureOffscreen.mockResolvedValue(true);
  mocks.waitOffscreen.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockImplementation(
    async (message: { type: string; imageFormat?: string }) => {
      if (message.type === MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME) {
        return { success: true, result: 'accepted' };
      }
      if (message.type === MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME) {
        return {
          success: true,
          result: 'captured',
          dataUrl: `data:image/${message.imageFormat === 'jpeg' ? 'jpeg' : (message.imageFormat ?? 'png')};base64,AA==`,
          width: 1200,
          height: 800,
        };
      }
      return { success: true, result: 'accepted' };
    }
  );
});

afterEach(() => vi.useRealTimers());

it('requires a prepared popup selection', async () => {
  await expect(runDesktopQuickAction({ context: createContext(), tabId: 7 })).rejects.toThrow(
    'selection is required'
  );
  expect(mocks.createJob).not.toHaveBeenCalled();
});

it('fails closed when privacy erasure owns the media mutation exclusion', async () => {
  mocks.acquireMutationPermit.mockReturnValueOnce(null);
  await expect(reserveDesktopQuickAction({ context: createContext(), tabId: 8 })).rejects.toThrow(
    'Local data erasure is in progress'
  );
});

it('rejects non-desktop context before reserving privileged resources', async () => {
  const context = { ...createContext(), captureMode: 'visible' as const };
  await expect(reserveDesktopQuickAction({ context, tabId: 81 })).rejects.toThrow(
    'Desktop capture is required'
  );
  expect(mocks.acquireMutationPermit).not.toHaveBeenCalled();
});

it('rejects a second picker for the same tab and releases an abandoned reservation on expiry', async () => {
  vi.useFakeTimers();
  const context = createContext();
  await reserveDesktopQuickAction({ context, tabId: 82 });
  await expect(reserveDesktopQuickAction({ context, tabId: 82 })).rejects.toThrow('already open');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME })
  );
  expect(mocks.releasePermit).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('releases the mutation permit when offscreen reservation fails', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'offscreen busy' });
  await expect(reserveDesktopQuickAction({ context: createContext(), tabId: 83 })).rejects.toThrow(
    'offscreen busy'
  );
  expect(mocks.releasePermit).toHaveBeenCalledOnce();
});

it('cancels the offscreen reservation without creating a capture job', async () => {
  const context = createContext();
  const preparation = await reserveDesktopQuickAction({ context, tabId: 9 });
  await expect(
    runDesktopQuickAction({
      context,
      desktopSelection: { ...preparation, status: 'cancelled' },
      tabId: 9,
    })
  ).resolves.toEqual({ result: 'cancelled' });
  expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME })
  );
  expect(mocks.releasePermit).toHaveBeenCalledOnce();
  expect(mocks.createJob).not.toHaveBeenCalled();
});

it.each([
  ['edit', 'temporary'],
  ['save_to_library', 'library'],
] as const)('delivers %s through its canonical owner', async (afterCapture, assetClass) => {
  await expect(runPrepared(createContext(afterCapture), 11)).resolves.toEqual({
    result: 'accepted',
  });

  expect(mocks.saveAsset).toHaveBeenCalledWith(
    createDataUrl(afterCapture),
    expect.any(String),
    undefined,
    assetClass
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME })
  );
  if (afterCapture === 'edit') {
    expect(mocks.openEditor).toHaveBeenCalledWith(expect.any(String), {
      assetId: 'asset-1',
      title: null,
      url: null,
    });
  }
  expect(mocks.transitionJob).toHaveBeenCalledWith('job-1', 'completed');
});

it('rejects desktop clipboard delivery before opening the picker', async () => {
  await expect(
    reserveDesktopQuickAction({ context: createContext('copy'), tabId: 11 })
  ).rejects.toThrow();

  expect(mocks.saveAsset).not.toHaveBeenCalled();
  expect(mocks.createJob).not.toHaveBeenCalled();
});

it.each([
  ['download_default', 'default-preset'],
  ['ask_system', undefined],
] as const)('routes %s through the download owner', async (afterCapture, presetId) => {
  await runPrepared(createContext(afterCapture), 12);

  expect(mocks.executeDownload).toHaveBeenCalledWith(
    createDataUrl(afterCapture),
    expect.stringContaining('_desktop.'),
    afterCapture,
    presetId,
    'job-1'
  );
});

it('marks the created capture job failed when a downstream sink rejects', async () => {
  mocks.executeDownload.mockRejectedValueOnce(new Error('download failed'));
  await expect(runPrepared(createContext(), 13)).rejects.toThrow('download failed');
  expect(mocks.transitionJob).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'download failed',
  });
});
