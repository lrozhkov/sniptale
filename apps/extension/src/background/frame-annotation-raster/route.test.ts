import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(async () => undefined),
  deleteJob: vi.fn(async () => undefined),
  send: vi.fn(async (): Promise<{ success: boolean; result?: string; error?: string }> => ({
    success: true,
    result: 'applied',
  })),
  wait: vi.fn(async () => undefined),
}));

vi.mock('../../composition/persistence/frame-annotation-raster-jobs', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/frame-annotation-raster-jobs')
  >()),
  deleteFrameAnnotationRasterJob: mocks.deleteJob,
}));

vi.mock('../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensure,
  waitForOffscreenReady: mocks.wait,
}));
vi.mock('../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.send }),
}));

import { reserveMediaErasureExclusion } from '../mutation-exclusion/media-activity';
import { routeFrameAnnotationRasterMessage } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue(undefined);
  mocks.wait.mockResolvedValue(undefined);
});

let nextLeaseNumber = 1;

async function prepareLease(): Promise<string> {
  const leaseId = `lease-${nextLeaseNumber++}`;
  const sendResponse = vi.fn();
  expect(
    routeFrameAnnotationRasterMessage(
      { type: MessageType.FRAME_ANNOTATION_RASTERIZE, operation: 'prepare', leaseId },
      sendResponse
    )
  ).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  const response = sendResponse.mock.calls[0]?.[0] as { success: boolean; result: string };
  expect(response.success).toBe(true);
  expect(response.result).toBe(leaseId);
  return response.result;
}

async function cancelLease(leaseId: string): Promise<void> {
  const sendResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    { type: MessageType.FRAME_ANNOTATION_RASTERIZE, operation: 'cancel', leaseId },
    sendResponse
  );
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'cancelled' })
  );
}

it('routes a valid bounded reference through the offscreen owner', async () => {
  const leaseId = await prepareLease();
  const sendResponse = vi.fn();
  expect(
    routeFrameAnnotationRasterMessage(
      {
        operation: 'rasterize',
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        reference: { inputSha256: 'a'.repeat(64), jobId: leaseId, revision: 1 },
      },
      sendResponse
    )
  ).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'completed' })
  );
  expect(mocks.ensure).toHaveBeenCalledTimes(2);
  expect(mocks.send).toHaveBeenCalledOnce();
});

it('rejects malformed references without opening offscreen', () => {
  expect(
    routeFrameAnnotationRasterMessage(
      {
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'rasterize',
        reference: { inputSha256: 'bad', jobId: 'job-1', revision: 1 },
      },
      vi.fn()
    )
  ).toBe(false);
  expect(routeFrameAnnotationRasterMessage({ type: 'other' }, vi.fn())).toBe(false);
});

it('surfaces the authoritative offscreen failure response', async () => {
  const leaseId = await prepareLease();
  mocks.send.mockResolvedValueOnce({ success: false, error: 'offscreen failed' });
  const sendResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'rasterize',
      reference: { inputSha256: 'b'.repeat(64), jobId: leaseId, revision: 2 },
    },
    sendResponse
  );
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'offscreen failed' })
  );
});

it('atomically rejects a concurrent rasterize request for the same one-shot lease', async () => {
  const leaseId = await prepareLease();
  let resolveRenderEnsure!: (value: undefined) => void;
  mocks.ensure.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        resolveRenderEnsure = resolve;
      })
  );
  const reference = { inputSha256: 'c'.repeat(64), jobId: leaseId, revision: 3 };
  const firstResponse = vi.fn();
  const duplicateResponse = vi.fn();

  routeFrameAnnotationRasterMessage(
    { type: MessageType.FRAME_ANNOTATION_RASTERIZE, operation: 'rasterize', reference },
    firstResponse
  );
  routeFrameAnnotationRasterMessage(
    { type: MessageType.FRAME_ANNOTATION_RASTERIZE, operation: 'rasterize', reference },
    duplicateResponse
  );

  await vi.waitFor(() =>
    expect(duplicateResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Frame annotation raster lease is already running',
    })
  );
  expect(mocks.send).not.toHaveBeenCalled();
  resolveRenderEnsure(undefined);
  await vi.waitFor(() =>
    expect(firstResponse).toHaveBeenCalledWith({ success: true, result: 'completed' })
  );
  expect(mocks.send).toHaveBeenCalledOnce();
});

it('fails overlapping lease admission immediately instead of queueing an abandoned request', async () => {
  const leaseId = await prepareLease();
  const overlappingResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'prepare',
      leaseId: 'overlap-lease',
    },
    overlappingResponse
  );
  await vi.waitFor(() =>
    expect(overlappingResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Frame annotation raster export is already in progress',
    })
  );
  expect(mocks.ensure).toHaveBeenCalledOnce();

  const cancelResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    { type: MessageType.FRAME_ANNOTATION_RASTERIZE, operation: 'cancel', leaseId },
    cancelResponse
  );
  await vi.waitFor(() =>
    expect(cancelResponse).toHaveBeenCalledWith({ success: true, result: 'cancelled' })
  );
  const nextLeaseId = await prepareLease();
  expect(nextLeaseId).not.toBe(leaseId);
  const finalCancelResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'cancel',
      leaseId: nextLeaseId,
    },
    finalCancelResponse
  );
  await vi.waitFor(() =>
    expect(finalCancelResponse).toHaveBeenCalledWith({ success: true, result: 'cancelled' })
  );
});

it('cannot publish a lease after its correlated preparation is cancelled', async () => {
  let resolveEnsure!: (value: undefined) => void;
  mocks.ensure.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        resolveEnsure = resolve;
      })
  );
  const prepareResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'prepare',
      leaseId: 'delayed-lease',
    },
    prepareResponse
  );

  const cancelResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'cancel',
      leaseId: 'delayed-lease',
    },
    cancelResponse
  );
  await vi.waitFor(() => expect(cancelResponse).toHaveBeenCalled());
  resolveEnsure(undefined);
  await vi.waitFor(() =>
    expect(prepareResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Frame annotation raster preparation was cancelled',
    })
  );

  const nextLeaseId = await prepareLease();
  await cancelLease(nextLeaseId);
});

it('bounds a preparation even when offscreen initialization never settles', async () => {
  vi.useFakeTimers();
  mocks.ensure.mockImplementationOnce(() => new Promise<undefined>(() => undefined));
  const prepareResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'prepare',
      leaseId: 'stalled-lease',
    },
    prepareResponse
  );
  await vi.advanceTimersByTimeAsync(10_000);
  expect(prepareResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Frame annotation raster preparation timed out',
  });
  vi.useRealTimers();

  const nextLeaseId = await prepareLease();
  await cancelLease(nextLeaseId);
});

it('bounds a running offscreen command and admits the next export without a stale lease', async () => {
  const leaseId = await prepareLease();
  vi.useFakeTimers();
  mocks.send.mockImplementationOnce(() => new Promise(() => undefined));
  const rasterResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      operation: 'rasterize',
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      reference: { inputSha256: 'f'.repeat(64), jobId: leaseId, revision: 6 },
    },
    rasterResponse
  );

  await vi.advanceTimersByTimeAsync(55_000);
  expect(rasterResponse).toHaveBeenCalledWith({
    error: 'Frame annotation rasterization timed out',
    success: false,
  });
  vi.useRealTimers();

  const nextLeaseId = await prepareLease();
  await cancelLease(nextLeaseId);
});

it('bounds stalled running offscreen setup inside the raster deadline', async () => {
  const leaseId = await prepareLease();
  let resolveSetup!: (value: undefined) => void;
  vi.useFakeTimers();
  try {
    mocks.ensure.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSetup = resolve;
        })
    );
    const rasterResponse = vi.fn();
    routeFrameAnnotationRasterMessage(
      {
        operation: 'rasterize',
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        reference: { inputSha256: 'a'.repeat(64), jobId: leaseId, revision: 8 },
      },
      rasterResponse
    );

    await vi.advanceTimersByTimeAsync(55_000);
    expect(rasterResponse).toHaveBeenCalledWith({
      error: 'Frame annotation rasterization timed out',
      success: false,
    });
  } finally {
    vi.useRealTimers();
  }

  const nextLeaseId = await prepareLease();
  await cancelLease(nextLeaseId);
  resolveSetup(undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.send).not.toHaveBeenCalled();
});

it('detaches a cancelled running lease so a retry is not rejected as already in progress', async () => {
  const leaseId = await prepareLease();
  let resolveRaster!: (value: { success: boolean; result: string }) => void;
  mocks.send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRaster = resolve;
      })
  );
  routeFrameAnnotationRasterMessage(
    {
      operation: 'rasterize',
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      reference: { inputSha256: '1'.repeat(64), jobId: leaseId, revision: 7 },
    },
    vi.fn()
  );
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  await cancelLease(leaseId);

  const nextLeaseId = await prepareLease();
  await cancelLease(nextLeaseId);
  resolveRaster({ success: true, result: 'applied' });
});

it('makes privacy erasure wait for admitted staging and rejects a new prepare', async () => {
  const leaseId = await prepareLease();
  const erasure = reserveMediaErasureExclusion();
  try {
    let erasureDrained = false;
    const erasureDrain = erasure.waitForActiveMutations().then(() => {
      erasureDrained = true;
    });
    let resolvePayloadDeletion!: (value: undefined) => void;
    mocks.deleteJob.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolvePayloadDeletion = resolve;
        })
    );
    await Promise.resolve();
    expect(erasureDrained).toBe(false);

    const cancellation = cancelLease(leaseId);
    await vi.waitFor(() => expect(mocks.deleteJob).toHaveBeenCalledWith(leaseId));
    expect(erasureDrained).toBe(false);
    resolvePayloadDeletion(undefined);
    await cancellation;
    await erasureDrain;

    const rejectedResponse = vi.fn();
    routeFrameAnnotationRasterMessage(
      {
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'prepare',
        leaseId: 'post-erasure-prepare',
      },
      rejectedResponse
    );
    await vi.waitFor(() =>
      expect(rejectedResponse).toHaveBeenCalledWith({
        error: 'privacy-erasure-in-progress',
        success: false,
      })
    );
  } finally {
    erasure.release();
  }
});

it('holds erasure exclusion after cancellation until an active raster operation settles', async () => {
  const leaseId = await prepareLease();
  let resolveRenderEnsure!: (value: undefined) => void;
  mocks.ensure.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        resolveRenderEnsure = resolve;
      })
  );
  const rasterResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      operation: 'rasterize',
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      reference: { inputSha256: 'd'.repeat(64), jobId: leaseId, revision: 4 },
    },
    rasterResponse
  );
  const erasure = reserveMediaErasureExclusion();
  try {
    let erasureDrained = false;
    const erasureDrain = erasure.waitForActiveMutations().then(() => {
      erasureDrained = true;
    });

    await cancelLease(leaseId);
    expect(erasureDrained).toBe(false);
    resolveRenderEnsure(undefined);
    await vi.waitFor(() =>
      expect(rasterResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Frame annotation rasterization was cancelled',
      })
    );
    expect(mocks.send).not.toHaveBeenCalled();
    await erasureDrain;
  } finally {
    erasure.release();
  }
});

it('releases the erasure exclusion when render setup or cancellation cleanup fails', async () => {
  const setupFailureLeaseId = await prepareLease();
  mocks.ensure.mockRejectedValueOnce(new Error('render setup failed'));
  const setupFailureResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      operation: 'rasterize',
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      reference: {
        inputSha256: 'e'.repeat(64),
        jobId: setupFailureLeaseId,
        revision: 5,
      },
    },
    setupFailureResponse
  );
  await vi.waitFor(() =>
    expect(setupFailureResponse).toHaveBeenCalledWith({
      error: 'render setup failed',
      success: false,
    })
  );

  const cleanupFailureLeaseId = await prepareLease();
  mocks.deleteJob.mockRejectedValueOnce(new Error('job deletion failed'));
  const cleanupFailureResponse = vi.fn();
  routeFrameAnnotationRasterMessage(
    {
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'cancel',
      leaseId: cleanupFailureLeaseId,
    },
    cleanupFailureResponse
  );
  await vi.waitFor(() =>
    expect(cleanupFailureResponse).toHaveBeenCalledWith({
      error: 'job deletion failed',
      success: false,
    })
  );

  const erasure = reserveMediaErasureExclusion();
  await expect(erasure.waitForActiveMutations()).resolves.toBeUndefined();
  erasure.release();
});
