import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: <T>(message: T) => message,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({
    sendRuntimeMessage: mocks.sendRuntimeMessage,
    sendTabMessage: mocks.sendTabMessage,
  }),
}));
vi.mock('./session-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-registry')>()),
  getVideoSurfaceSession: mocks.getSession,
}));

import { verifyExactViewportOutput } from './exact-output-verification';

const binding = {
  generation: 4,
  recordingId: 'recording-1',
  streamInstanceId: 'stream-1',
  tabId: 7,
};
const viewport = {
  devicePixelRatio: 1,
  height: 900,
  scrollX: 0,
  scrollY: 0,
  width: 1600,
};
const session = {
  applied: { target: 'viewport' },
  generation: 4,
  recordingId: 'recording-1',
  streamInstanceId: 'stream-1',
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.generation = 4;
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set([
      236, 32, 58, 38, 220, 75, 42, 72, 232, 226, 42, 214,
    ]);
    return array;
  });
  mocks.getSession.mockReturnValue(session);
  mocks.sendTabMessage.mockResolvedValue({ result: 'applied', success: true });
  mocks.sendRuntimeMessage.mockResolvedValue({
    result: 'ALLOW',
    success: true,
    videoHeight: 1080,
    videoWidth: 1920,
  });
});

it('creates a fresh secure validator-compatible pattern for each transition', async () => {
  const palettes = [
    [236, 32, 58, 38, 220, 75, 42, 72, 232, 226, 42, 214],
    [17, 198, 241, 224, 31, 72, 45, 230, 84, 211, 53, 219],
  ];
  vi.mocked(globalThis.crypto.getRandomValues).mockImplementation((array) => {
    const palette = palettes.shift();
    if (!palette) throw new Error('Unexpected calibration entropy request');
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(palette);
    return array;
  });

  await verifyExactViewportOutput({ binding, transitionId: 'transition-a', viewport });
  await verifyExactViewportOutput({ binding, transitionId: 'transition-b', viewport });

  const firstPattern = mocks.sendTabMessage.mock.calls[0]?.[1].pattern;
  const secondPattern = mocks.sendTabMessage.mock.calls[2]?.[1].pattern;
  expect(firstPattern).toBeDefined();
  expect(secondPattern).toBeDefined();
  expect(secondPattern).not.toEqual(firstPattern);
  expect(globalThis.crypto.getRandomValues).toHaveBeenCalledTimes(2);
});

it('orders marker presentation, marked frame proof, marker cleanup, and clean frame proof', async () => {
  await expect(
    verifyExactViewportOutput({
      binding,
      documentId: 'document-4',
      transitionId: 'transition-4',
      viewport,
    })
  ).resolves.toEqual({ height: 1080, width: 1920 });

  expect(mocks.sendTabMessage).toHaveBeenNthCalledWith(
    1,
    7,
    expect.objectContaining({ type: 'SHOW_VIEWPORT_CALIBRATION' }),
    { documentId: 'document-4', frameId: 0 }
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ verification: expect.objectContaining({ phase: 'marked' }) })
  );
  expect(mocks.sendTabMessage).toHaveBeenNthCalledWith(
    2,
    7,
    expect.objectContaining({ type: 'HIDE_VIEWPORT_CALIBRATION' }),
    { documentId: 'document-4', frameId: 0 }
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ verification: expect.objectContaining({ phase: 'clean' }) })
  );
  expect(mocks.sendRuntimeMessage.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.sendTabMessage.mock.invocationCallOrder[1]!
  );
  expect(mocks.sendTabMessage.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.sendRuntimeMessage.mock.invocationCallOrder[1]!
  );
});

it('hides the marker and fails closed when marked-frame verification is denied', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    error: 'marker not visible in captured frame',
    result: 'DENY',
    success: false,
  });

  await expect(
    verifyExactViewportOutput({ binding, transitionId: 'transition-denied', viewport })
  ).rejects.toThrow('marker not visible');
  expect(mocks.sendTabMessage).toHaveBeenCalledTimes(2);
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
});

it('attempts exact marker cleanup when the show response is lost after delivery', async () => {
  mocks.sendTabMessage
    .mockRejectedValueOnce(new Error('show response was lost'))
    .mockResolvedValueOnce({ result: 'applied', success: true });

  await expect(
    verifyExactViewportOutput({ binding, transitionId: 'transition-response-loss', viewport })
  ).rejects.toThrow('show response was lost');
  expect(mocks.sendTabMessage).toHaveBeenCalledTimes(2);
  expect(mocks.sendTabMessage.mock.calls[0]?.[1]).toMatchObject({
    transitionId: 'transition-response-loss',
    type: 'SHOW_VIEWPORT_CALIBRATION',
  });
  expect(mocks.sendTabMessage.mock.calls[1]?.[1]).toMatchObject({
    transitionId: 'transition-response-loss',
    type: 'HIDE_VIEWPORT_CALIBRATION',
  });
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('rejects a superseded generation after cleaning up its exact marker', async () => {
  mocks.sendRuntimeMessage.mockImplementationOnce(async () => {
    session.generation = 5;
    return { result: 'ALLOW', success: true, videoHeight: 1080, videoWidth: 1920 };
  });

  await expect(
    verifyExactViewportOutput({ binding, transitionId: 'transition-stale', viewport })
  ).rejects.toThrow('binding was superseded');
  expect(mocks.sendTabMessage).toHaveBeenCalledTimes(2);
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
});
