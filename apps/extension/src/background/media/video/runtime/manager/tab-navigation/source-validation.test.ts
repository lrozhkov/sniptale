import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readViewport: vi.fn(),
  reassert: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  verifyExactViewportOutput: vi.fn(),
}));

vi.mock('../../../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../capture-surface')>()),
  getCaptureSurfaceService: () => ({ reassert: mocks.reassert }),
}));
vi.mock('../../../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('../../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface')>()),
  getVideoSurfaceSession: mocks.getSession,
}));
vi.mock('../../../capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-viewport')>()),
  readTabCaptureViewport: mocks.readViewport,
}));
vi.mock('../../../capture-surface/exact-output-verification', () => ({
  verifyExactViewportOutput: mocks.verifyExactViewportOutput,
}));

import { reassertViewportSurface, revalidateTabSource } from './source-validation';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const binding = {
  generation: 2,
  recordingId: 'recording-1',
  streamInstanceId: 'stream-1',
  tabId: 7,
};
const viewport = {
  devicePixelRatio: 2,
  height: 720,
  scrollX: 0,
  scrollY: 0,
  width: 1280,
};
const session = {
  applied: {
    generation: 2,
    height: 720,
    leaseId: 'lease-1',
    presetId: 'preset-1',
    sessionId: 'recording-1',
    target: 'viewport' as const,
    width: 1280,
  },
  sourceVideoHeight: 1440,
  sourceVideoWidth: 2560,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.sourceVideoHeight = 1440;
  session.sourceVideoWidth = 2560;
  mocks.getSession.mockReturnValue(session);
  mocks.readViewport.mockResolvedValue(viewport);
  mocks.reassert.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    result: 'ALLOW',
    videoWidth: 2560,
    videoHeight: 1440,
  });
  mocks.verifyExactViewportOutput.mockResolvedValue({ height: 900, width: 1600 });
});

it('reasserts only an applied viewport lease', async () => {
  await reassertViewportSurface(binding);
  expect(mocks.reassert).toHaveBeenCalledWith({
    generation: 2,
    leaseId: 'lease-1',
    sessionId: 'recording-1',
  });

  mocks.getSession.mockReturnValueOnce({
    ...session,
    applied: { ...session.applied, target: 'window' },
  });
  await reassertViewportSurface(binding);
  mocks.getSession.mockReturnValueOnce(null);
  await reassertViewportSurface(binding);
  expect(mocks.reassert).toHaveBeenCalledOnce();
});

it('reads and forwards the live viewport when the caller has not already measured it', async () => {
  await revalidateTabSource(binding, null, 'navigation-1');

  expect(mocks.readViewport).toHaveBeenCalledWith(7);
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      generation: 2,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      transitionId: 'navigation-1',
      type: 'OFFSCREEN_REVALIDATE_SOURCE',
      viewport,
    })
  );
});

it('uses an atomically restored viewport without reading it twice', async () => {
  await revalidateTabSource(binding, viewport);
  expect(mocks.readViewport).not.toHaveBeenCalled();
});

it('uses frame-verified recovery only for TAB plus an applied viewport preset', async () => {
  await revalidateTabSource(
    { ...binding, captureMode: CaptureMode.TAB },
    viewport,
    'navigation-frame-1',
    'document-frame-1'
  );

  expect(mocks.verifyExactViewportOutput).toHaveBeenCalledWith({
    binding: { ...binding, captureMode: CaptureMode.TAB },
    documentId: 'document-frame-1',
    transitionId: 'navigation-frame-1',
    viewport,
  });
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(session).toMatchObject({ sourceVideoHeight: 900, sourceVideoWidth: 1600 });

  await revalidateTabSource(
    { ...binding, captureMode: CaptureMode.TAB_CROP },
    viewport,
    'navigation-crop-1',
    'document-frame-1'
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
});

it('revalidates the raw source without depending on the navigated page runtime', async () => {
  await expect(revalidateTabSource(binding, null)).resolves.toBeUndefined();
  expect(mocks.readViewport).toHaveBeenCalledWith(7);
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
});

it('rejects missing sessions and denied offscreen validation', async () => {
  mocks.getSession.mockReturnValueOnce(null);
  await expect(revalidateTabSource(binding, viewport)).rejects.toThrow(
    'surface session is unavailable'
  );

  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: false,
    result: 'DENY',
    error: 'mapping changed',
  });
  await expect(revalidateTabSource(binding, viewport)).rejects.toThrow('mapping changed');

  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true, result: 'DENY' });
  await expect(revalidateTabSource(binding, viewport)).rejects.toThrow(
    'mapping revalidation failed'
  );
});

it('accepts remapped raw dimensions and rejects missing fresh source metadata', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: true,
    result: 'ALLOW',
    videoWidth: 1920,
    videoHeight: 1080,
  });
  await expect(revalidateTabSource(binding, viewport, 'navigation-1')).resolves.toBeUndefined();
  expect(session).toMatchObject({ sourceVideoHeight: 1080, sourceVideoWidth: 1920 });

  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: true,
    result: 'ALLOW',
    videoWidth: undefined,
    videoHeight: undefined,
  });
  await expect(revalidateTabSource(binding, viewport)).rejects.toThrow(
    'Raw recording source dimensions are unavailable'
  );
});
