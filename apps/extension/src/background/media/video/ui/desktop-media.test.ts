import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  requestDesktopMedia,
  requestDesktopMediaSource,
  requestDisplayMediaSource,
} from './desktop-media';
import {
  createDesktopMediaCancelledMessage,
  createDesktopMediaFailedMessage,
  createDesktopMediaObtainedMessage,
  createRequestDeps,
  createRuntimeSubscriptionHarness,
  createSelectedDesktopSource,
  createSendRuntimeMessageMock,
  type RuntimeSubscriptionHarness,
  type SendRuntimeMessageMock,
} from './desktop-media.test-support';
function startDisplayMediaRequest(
  runtime: RuntimeSubscriptionHarness,
  sendRuntimeMessage: SendRuntimeMessageMock,
  options: Parameters<typeof requestDisplayMediaSource>[1] = { sourceCount: 2, sourceIndex: 0 }
) {
  return requestDisplayMediaSource(
    CaptureMode.SCREEN,
    options,
    createRequestDeps({ runtime, sendRuntimeMessage, chooseDesktopMediaSource: vi.fn() })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('keeps single-source desktop media requests compatible', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const resultPromise = requestDesktopMedia(
    CaptureMode.SCREEN,
    true,
    createRequestDeps({ runtime, sendRuntimeMessage })
  );

  runtime.emit(createDesktopMediaObtainedMessage(sendRuntimeMessage, 'Screen 1'));

  await expect(resultPromise).resolves.toEqual({ label: 'Screen 1' });
  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
      captureMode: CaptureMode.SCREEN,
      desktopMediaRequestGeneration: expect.any(String),
      desktopMediaRequestId: expect.any(String),
      controlledCursorCaptureEnabled: true,
    })
  );

  await expect(
    requestDesktopMedia(
      CaptureMode.SCREEN,
      false,
      createRequestDeps({
        runtime: createRuntimeSubscriptionHarness(),
        sendRuntimeMessage: createSendRuntimeMessageMock().mockRejectedValue(
          new Error('request failed')
        ),
      })
    )
  ).resolves.toBeNull();
});

it('ignores desktop media responses from wrong senders and stale requests', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const trustedSender = {
    url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html',
  };
  const resultPromise = requestDesktopMedia(
    CaptureMode.SCREEN,
    true,
    createRequestDeps({
      runtime,
      sendRuntimeMessage,
      isTrustedOffscreenRuntimeSender: (sender) => sender.url === trustedSender.url,
    })
  );
  let settled = false;
  void resultPromise.then(() => {
    settled = true;
  });
  const response = createDesktopMediaObtainedMessage(sendRuntimeMessage, 'Screen 1');

  runtime.emit(response, { url: 'chrome-extension://test/apps/extension/src/popup/index.html' });
  runtime.emit({ ...response, desktopMediaRequestId: 'stale-request' }, trustedSender);
  await Promise.resolve();
  expect(settled).toBe(false);

  runtime.emit(response, trustedSender);

  await expect(resultPromise).resolves.toEqual({ label: 'Screen 1' });
});

it('sends source index metadata after preparing the selected desktop stream', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const chooseDesktopMediaSource = vi.fn().mockResolvedValue(createSelectedDesktopSource());
  const beforeDesktopStreamAcquire = vi.fn(async () => undefined);

  const resultPromise = requestDesktopMediaSource(
    CaptureMode.SCREEN,
    { beforeDesktopStreamAcquire, sourceCount: 3, sourceIndex: 1 },
    createRequestDeps({ runtime, sendRuntimeMessage, chooseDesktopMediaSource })
  );

  expect(chooseDesktopMediaSource).toHaveBeenCalledWith(CaptureMode.SCREEN);
  await Promise.resolve();
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
  expect(beforeDesktopStreamAcquire).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(sendRuntimeMessage).toHaveBeenCalledTimes(1));
  runtime.emit(createDesktopMediaObtainedMessage(sendRuntimeMessage, 'Window 2'));

  await expect(resultPromise).resolves.toEqual({ label: 'Window 2' });
  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
      captureMode: CaptureMode.SCREEN,
      desktopMediaRequestGeneration: expect.any(String),
      desktopMediaRequestId: expect.any(String),
      desktopStreamId: 'desktop-2',
      desktopLabel: 'Window 2',
      sourceCount: 3,
      sourceIndex: 1,
    })
  );
});

it('rejects offscreen acquisition failures without reporting picker cancellation', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const resultPromise = requestDesktopMediaSource(
    CaptureMode.SCREEN,
    { sourceCount: 3, sourceIndex: 1 },
    createRequestDeps({ runtime, sendRuntimeMessage })
  );

  await vi.waitFor(() => expect(sendRuntimeMessage).toHaveBeenCalledTimes(1));
  const rejection = expect(resultPromise).rejects.toMatchObject({
    message: 'getUserMedia failed',
    name: 'DesktopMediaAcquisitionError',
    sourceCount: 3,
    sourceIndex: 1,
  });
  runtime.emit(
    createDesktopMediaFailedMessage(
      sendRuntimeMessage,
      'getUserMedia failed',
      'desktop-stream-acquire'
    )
  );

  await rejection;
});

it('rejects picker failures separately from desktop acquisition cancellation', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const chooseDesktopMediaSource = vi.fn().mockResolvedValue({
    error: 'activation expired',
    status: 'failed',
  });

  await expect(
    requestDesktopMediaSource(
      CaptureMode.SCREEN,
      { sourceCount: 3, sourceIndex: 0 },
      createRequestDeps({ runtime, sendRuntimeMessage, chooseDesktopMediaSource })
    )
  ).rejects.toMatchObject({
    message: 'activation expired',
    name: 'DesktopMediaPickerError',
    phase: 'desktop-picker',
    sourceCount: 3,
    sourceIndex: 0,
  });
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});

it('resolves null when the picker is explicitly cancelled', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const chooseDesktopMediaSource = vi.fn().mockResolvedValue({ status: 'cancelled' });

  await expect(
    requestDesktopMediaSource(
      CaptureMode.SCREEN,
      { sourceCount: 3, sourceIndex: 0 },
      createRequestDeps({ runtime, sendRuntimeMessage, chooseDesktopMediaSource })
    )
  ).resolves.toBeNull();
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});

it('rejects offscreen readiness failures as acquisition failures', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const beforeDesktopStreamAcquire = vi.fn(async () => {
    throw 'offscreen unavailable';
  });

  await expect(
    requestDesktopMediaSource(
      CaptureMode.SCREEN,
      { beforeDesktopStreamAcquire, sourceCount: 3, sourceIndex: 1 },
      createRequestDeps({ runtime, sendRuntimeMessage })
    )
  ).rejects.toMatchObject({
    message: 'offscreen unavailable',
    name: 'DesktopMediaAcquisitionError',
    sourceCount: 3,
    sourceIndex: 1,
  });
  expect(sendRuntimeMessage).not.toHaveBeenCalled();
});

it('requests multi-source display media without opening desktopCapture', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  const resultPromise = startDisplayMediaRequest(runtime, sendRuntimeMessage, {
    controlledCursorCaptureEnabled: false,
    sourceCount: 3,
    sourceIndex: 1,
  });

  await vi.waitFor(() => expect(sendRuntimeMessage).toHaveBeenCalledTimes(1));
  runtime.emit(createDesktopMediaObtainedMessage(sendRuntimeMessage, 'Screen 2'));

  await expect(resultPromise).resolves.toEqual({ label: 'Screen 2' });
  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
      captureMode: CaptureMode.SCREEN,
      desktopMediaRequestGeneration: expect.any(String),
      desktopMediaRequestId: expect.any(String),
      controlledCursorCaptureEnabled: false,
      sourceCount: 3,
      sourceIndex: 1,
    })
  );
});

it('rejects display-media failures and cancellations with separate outcomes', async () => {
  const failedRuntime = createRuntimeSubscriptionHarness();
  const failedSend = createSendRuntimeMessageMock();
  const failedPromise = startDisplayMediaRequest(failedRuntime, failedSend);

  await vi.waitFor(() => expect(failedSend).toHaveBeenCalledTimes(1));
  failedRuntime.emit(
    createDesktopMediaFailedMessage(failedSend, 'getDisplayMedia failed', 'display-media-acquire')
  );
  await expect(failedPromise).rejects.toMatchObject({
    message: 'getDisplayMedia failed',
    phase: 'display-media-acquire',
  });

  const cancelledRuntime = createRuntimeSubscriptionHarness();
  const cancelledSend = createSendRuntimeMessageMock();
  const cancelledPromise = startDisplayMediaRequest(cancelledRuntime, cancelledSend);
  await vi.waitFor(() => expect(cancelledSend).toHaveBeenCalledTimes(1));
  cancelledRuntime.emit(createDesktopMediaCancelledMessage(cancelledSend));

  await expect(cancelledPromise).resolves.toBeNull();
});

it('rejects display-media readiness and timeout failures as acquisition failures', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();
  await expect(
    startDisplayMediaRequest(runtime, sendRuntimeMessage, {
      beforeDesktopStreamAcquire: async () => {
        throw new Error('offscreen unavailable');
      },
      sourceCount: 2,
      sourceIndex: 0,
    })
  ).rejects.toMatchObject({ message: 'offscreen unavailable', phase: 'display-media-acquire' });

  vi.useFakeTimers();
  const timeoutRuntime = createRuntimeSubscriptionHarness();
  const timeoutPromise = startDisplayMediaRequest(timeoutRuntime, createSendRuntimeMessageMock());
  const timeoutRejection = expect(timeoutPromise).rejects.toMatchObject({
    phase: 'display-media-acquire',
  });
  await vi.advanceTimersByTimeAsync(60000);
  await timeoutRejection;
});
