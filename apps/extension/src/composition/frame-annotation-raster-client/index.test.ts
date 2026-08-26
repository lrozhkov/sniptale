import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  deleteJob: vi.fn(async () => undefined),
  send: vi.fn(),
  stage: vi.fn(),
}));

vi.mock('../persistence/frame-annotation-raster-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/frame-annotation-raster-jobs')>()),
  consumeFrameAnnotationRasterOutput: mocks.consume,
  deleteFrameAnnotationRasterJob: mocks.deleteJob,
  stageFrameAnnotationRasterJob: mocks.stage,
}));

import { rasterizeFrameAnnotations } from '.';
import { runWithPersistentDataErasureBarrier } from '../persistence/infrastructure/mutation-barrier';

const reference = { jobId: 'job-1', revision: 1, digest: 'digest-1' };
const input = { baseImage: new Blob(['base']), height: 10, snapshots: [], width: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stage.mockResolvedValue(reference);
  mocks.send.mockImplementation(async (message: { leaseId?: string; operation?: string }) =>
    message.operation === 'prepare' || message.operation === 'confirm'
      ? { success: true, result: message.leaseId }
      : { success: true, result: 'completed' }
  );
  mocks.consume.mockResolvedValue({
    blob: new Blob(['output']),
    metadata: { downscaled: false, outputHeight: 10, outputScale: 1, outputWidth: 20 },
  });
});

afterEach(() => vi.useRealTimers());

it('consumes a validated result and always deletes the staged payload', async () => {
  await expect(
    rasterizeFrameAnnotations({ input, transport: { sendRuntimeMessage: mocks.send } })
  ).resolves.toMatchObject({
    metadata: { downscaled: false, outputWidth: 20 },
  });
  expect(mocks.consume).toHaveBeenCalledWith(reference);
  expect(mocks.deleteJob).toHaveBeenCalledWith('job-1');
});

it('does not start cleanup until atomic output consumption has finished', async () => {
  let resolveConsume!: (value: {
    blob: Blob;
    metadata: {
      downscaled: boolean;
      outputHeight: number;
      outputScale: number;
      outputWidth: number;
    };
  }) => void;
  mocks.consume.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveConsume = resolve;
      })
  );

  const result = rasterizeFrameAnnotations({
    input,
    transport: { sendRuntimeMessage: mocks.send },
  });
  await vi.waitFor(() => expect(mocks.consume).toHaveBeenCalledWith(reference));
  expect(mocks.deleteJob).not.toHaveBeenCalled();

  resolveConsume({
    blob: new Blob(['output']),
    metadata: { downscaled: false, outputHeight: 10, outputScale: 1, outputWidth: 20 },
  });
  await expect(result).resolves.toMatchObject({ metadata: { outputWidth: 20 } });
  expect(mocks.deleteJob).toHaveBeenCalledWith('job-1');
});

it('rejects a stale result before consume and still deletes the staged payload', async () => {
  await expect(
    rasterizeFrameAnnotations({
      input,
      isCurrent: () => false,
      transport: { sendRuntimeMessage: mocks.send },
    })
  ).rejects.toThrow('stale');
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.deleteJob).toHaveBeenCalledWith('job-1');
});

it('surfaces transport failure and still deletes the staged payload', async () => {
  mocks.send.mockImplementation(async (message: { leaseId?: string; operation?: string }) => {
    if (message.operation === 'prepare' || message.operation === 'confirm') {
      return { success: true, result: message.leaseId };
    }
    if (message.operation === 'rasterize') return { success: false, error: 'raster failed' };
    return { success: true, result: 'cancelled' };
  });
  await expect(
    rasterizeFrameAnnotations({ input, transport: { sendRuntimeMessage: mocks.send } })
  ).rejects.toThrow('raster failed');
  expect(mocks.deleteJob).toHaveBeenCalledWith('job-1');
});

it('rejects a mismatched preparation response and cancels without staging', async () => {
  mocks.send
    .mockResolvedValueOnce({ success: true, result: 'another-lease' })
    .mockResolvedValueOnce({ success: true, result: 'cancelled' });

  await expect(
    rasterizeFrameAnnotations({ input, transport: { sendRuntimeMessage: mocks.send } })
  ).rejects.toThrow('preparation failed');
  expect(mocks.stage).not.toHaveBeenCalled();
  expect(mocks.deleteJob).not.toHaveBeenCalled();
  expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'cancel' }));
});

it('cancels without cleanup when staging fails before a job reference exists', async () => {
  mocks.stage.mockRejectedValueOnce(new Error('staging failed'));

  await expect(
    rasterizeFrameAnnotations({ input, transport: { sendRuntimeMessage: mocks.send } })
  ).rejects.toThrow('staging failed');
  expect(mocks.deleteJob).not.toHaveBeenCalled();
  expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'cancel' }));
});

it('drops a cancelled job without consuming output', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    rasterizeFrameAnnotations({
      input,
      signal: controller.signal,
      transport: { sendRuntimeMessage: mocks.send },
    })
  ).rejects.toThrow();
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ operation: 'prepare' }));
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(mocks.deleteJob).toHaveBeenCalledWith('job-1');
});

it('does not leave a failed export pending when cancellation messaging stalls', async () => {
  vi.useFakeTimers();
  mocks.send.mockImplementation((message: { leaseId?: string; operation?: string }) => {
    if (message.operation === 'prepare' || message.operation === 'confirm')
      return Promise.resolve({ success: true, result: message.leaseId });
    if (message.operation === 'rasterize')
      return Promise.resolve({ success: false, error: 'raster failed' });
    return new Promise(() => undefined);
  });

  const result = rasterizeFrameAnnotations({
    input,
    transport: { sendRuntimeMessage: mocks.send },
  });
  const expectation = expect(result).rejects.toThrow('raster failed');
  await vi.advanceTimersByTimeAsync(3_000);

  await expectation;
  expect(mocks.deleteJob).toHaveBeenCalledWith('job-1');
});

it('does not hide the export failure when staged payload deletion stalls', async () => {
  vi.useFakeTimers();
  mocks.deleteJob.mockImplementationOnce(() => new Promise(() => undefined));
  mocks.send.mockImplementation(async (message: { leaseId?: string; operation?: string }) =>
    message.operation === 'prepare' || message.operation === 'confirm'
      ? { success: true, result: message.leaseId }
      : message.operation === 'rasterize'
        ? { success: false, error: 'raster failed' }
        : { success: true, result: 'cancelled' }
  );

  const result = rasterizeFrameAnnotations({
    input,
    transport: { sendRuntimeMessage: mocks.send },
  });
  const expectation = expect(result).rejects.toThrow('raster failed');
  await vi.advanceTimersByTimeAsync(3_000);

  await expectation;
});

it('cancels the correlated preparation identity after a client timeout', async () => {
  vi.useFakeTimers();
  mocks.send.mockImplementation((message: { leaseId?: string; operation?: string }) => {
    if (message.operation === 'prepare') return new Promise(() => undefined);
    return Promise.resolve({ success: true, result: 'cancelled' });
  });

  const result = rasterizeFrameAnnotations({
    input,
    transport: { sendRuntimeMessage: mocks.send },
  });
  const expectation = expect(result).rejects.toThrow('preparation timed out');
  await vi.advanceTimersByTimeAsync(40_000);
  await expectation;

  const prepareMessage = mocks.send.mock.calls.find(
    ([message]) => message.operation === 'prepare'
  )?.[0];
  expect(prepareMessage?.leaseId).toEqual(expect.any(String));
  expect(mocks.send).toHaveBeenCalledWith({
    type: expect.any(String),
    operation: 'cancel',
    leaseId: prepareMessage?.leaseId,
  });
});

it('keeps the client transition alive while cold offscreen preparation is admitted', async () => {
  vi.useFakeTimers();
  mocks.send.mockImplementation((message: { leaseId?: string; operation?: string }) => {
    if (message.operation === 'prepare') {
      return new Promise((resolve) =>
        setTimeout(() => resolve({ success: true, result: message.leaseId }), 37_000)
      );
    }
    if (message.operation === 'confirm') {
      return Promise.resolve({ success: true, result: message.leaseId });
    }
    return Promise.resolve({ success: true, result: 'completed' });
  });

  const result = rasterizeFrameAnnotations({
    input,
    transport: { sendRuntimeMessage: mocks.send },
  });
  await vi.advanceTimersByTimeAsync(37_000);

  await expect(result).resolves.toMatchObject({ metadata: { outputWidth: 20 } });
});

it('does not hold the persistence transition while offscreen storage is initialized', async () => {
  mocks.send.mockImplementation(async (message: { leaseId?: string; operation?: string }) => {
    if (message.operation === 'prepare') {
      await runWithPersistentDataErasureBarrier(async () => undefined);
      return { success: true, result: message.leaseId };
    }
    if (message.operation === 'confirm') return { success: true, result: message.leaseId };
    return { success: true, result: 'completed' };
  });

  await expect(
    rasterizeFrameAnnotations({ input, transport: { sendRuntimeMessage: mocks.send } })
  ).resolves.toMatchObject({ metadata: { outputWidth: 20 } });
});

it('does not stage payload after the background lease is lost across a worker restart', async () => {
  mocks.send.mockImplementation(async (message: { leaseId?: string; operation?: string }) => {
    if (message.operation === 'prepare') return { success: true, result: message.leaseId };
    if (message.operation === 'confirm') {
      return { success: false, error: 'Frame annotation raster lease is no longer active' };
    }
    return { success: true, result: 'cancelled' };
  });

  await expect(
    rasterizeFrameAnnotations({ input, transport: { sendRuntimeMessage: mocks.send } })
  ).rejects.toThrow('lease is no longer active');
  expect(mocks.stage).not.toHaveBeenCalled();
  expect(mocks.deleteJob).not.toHaveBeenCalled();
});
