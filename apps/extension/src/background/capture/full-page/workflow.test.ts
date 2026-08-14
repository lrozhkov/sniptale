import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  captureTiles: vi.fn(),
  createAgent: vi.fn(),
  createJob: vi.fn(),
  createNative: vi.fn(),
  cleanupStoredLease: vi.fn(),
  loadSettings: vi.fn(),
  releaseLease: vi.fn(),
  renewLease: vi.fn(),
  runExclusive: vi.fn(async (work: () => Promise<unknown>) => work()),
  runNativeExclusive: vi.fn(async (work: (lease: unknown) => Promise<unknown>) =>
    work({ capture: vi.fn() })
  ),
  transition: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  createCaptureJob: mocks.createJob,
  getCaptureJobRuntimeGeneration: () => 'runtime-1',
  transitionCaptureJob: mocks.transition,
}));
vi.mock('../visible/coordinator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../visible/coordinator')>()),
  runNativeVisibleCaptureExclusive: mocks.runNativeExclusive,
}));
vi.mock('./capture-parts', () => ({ captureAndStitchFullPageTiles: mocks.captureTiles }));
vi.mock('./lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lifecycle')>()),
  cleanupStoredFullPageCaptureLease: mocks.cleanupStoredLease,
}));
vi.mock('./native-backend', () => ({ createNativeFullPageRasterBackend: mocks.createNative }));
vi.mock('./page-agent-transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-agent-transport')>()),
  createFullPagePageAgentTransport: mocks.createAgent,
}));
vi.mock('./planner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./planner')>()),
  createFullPageTilePlan: () => [{ row: 0 }],
}));
vi.mock('./session-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-lease')>()),
  acquireFullPageCaptureLease: mocks.acquireLease,
  releaseFullPageCaptureLease: mocks.releaseLease,
  renewFullPageCaptureLease: mocks.renewLease,
  runFullPageCaptureExclusive: mocks.runExclusive,
}));

import { cancelFullPageCaptureByExportRunId } from './cancellation';
import { captureFullPageTransaction } from './workflow';

const geometry = {
  devicePixelRatio: 1,
  extentHeight: 900,
  extentWidth: 800,
  outputHeight: 900,
  outputWidth: 800,
  rootKind: 'document' as const,
  rootViewport: { height: 500, width: 800, x: 0, y: 0 },
  viewportHeight: 500,
  viewportWidth: 800,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createJob.mockResolvedValue({ jobId: 'job-1' });
  mocks.transition.mockResolvedValue(undefined);
  mocks.loadSettings.mockResolvedValue({
    fullPageCapture: {
      floatingElements: 'once',
      freezeMotion: true,
      preloadLazyContent: true,
    },
  });
  mocks.acquireLease.mockResolvedValue(undefined);
  mocks.cleanupStoredLease.mockResolvedValue(undefined);
  mocks.createNative.mockResolvedValue({
    captureFrame: vi.fn(),
    release: vi.fn().mockResolvedValue(undefined),
  });
  mocks.releaseLease.mockResolvedValue(undefined);
  mocks.renewLease.mockResolvedValue(undefined);
});

it('runs native scroll-and-stitch behind the shared visible-capture coordinator and restores exactly', async () => {
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({
      actualX: 0,
      actualY: 0,
      frozenExtentWarning: false,
      geometry,
      layoutGeneration: 'layout-1',
      warnings: [],
    }),
    prepareTile: vi.fn(),
    restore: vi.fn().mockResolvedValue(undefined),
    verifyTile: vi.fn(),
  };
  const raster = { captureFrame: vi.fn(), release: vi.fn().mockResolvedValue(undefined) };
  mocks.createAgent.mockReturnValue(agent);
  mocks.createNative.mockResolvedValue(raster);
  mocks.captureTiles.mockResolvedValue({
    dataUrl: 'data:image/png;base64,result',
    metadata: {
      cssHeight: 900,
      cssWidth: 800,
      downscaled: false,
      frozenExtentWarning: false,
      outputHeight: 900,
      outputScale: 1,
      outputWidth: 800,
      warnings: [],
    },
  });

  await expect(
    captureFullPageTransaction(41, undefined, {
      backendKind: 'native',
      documentId: 'document-1',
    })
  ).resolves.toEqual(
    expect.objectContaining({ dataUrl: 'data:image/png;base64,result', jobId: 'job-1' })
  );

  expect(mocks.runNativeExclusive).toHaveBeenCalledTimes(1);
  expect(mocks.captureTiles).toHaveBeenCalledWith(
    expect.objectContaining({ agent, raster, layoutGeneration: 'layout-1' })
  );
  expect(agent.restore).toHaveBeenCalledWith(
    expect.objectContaining({ jobId: 'job-1', runtimeGeneration: 'runtime-1' })
  );
  expect(raster.release).toHaveBeenCalledTimes(1);
  expect(mocks.releaseLease).toHaveBeenCalledTimes(1);
});

it('releases the storage lease and marks the job failed when page preparation rejects', async () => {
  const error = new Error('prepare failed');
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockRejectedValue(error),
    restore: vi.fn(),
  };
  mocks.createAgent.mockReturnValue(agent);

  await expect(
    captureFullPageTransaction(43, undefined, {
      backendKind: 'native',
      documentId: 'document-3',
    })
  ).rejects.toBe(error);

  expect(agent.restore).not.toHaveBeenCalled();
  expect(mocks.releaseLease).toHaveBeenCalledTimes(1);
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'prepare failed',
  });
});

it('reconciles a retained durable lease before acquiring a new full-page owner', async () => {
  const recoveryFailure = new Error('previous cleanup pending');
  mocks.cleanupStoredLease.mockRejectedValueOnce(recoveryFailure);

  await expect(
    captureFullPageTransaction(143, undefined, {
      backendKind: 'native',
      documentId: 'document-143',
    })
  ).rejects.toBe(recoveryFailure);

  expect(mocks.acquireLease).not.toHaveBeenCalled();
});

it('retains the durable lease when page restoration still needs a retry', async () => {
  const restoreFailure = new Error('restore pending');
  mocks.createAgent.mockReturnValue({
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockRejectedValue(restoreFailure),
  });
  mocks.captureTiles.mockRejectedValueOnce(new Error('tile failed'));

  await expect(
    captureFullPageTransaction(147, undefined, {
      backendKind: 'native',
      documentId: 'document-147',
    })
  ).rejects.toThrow('Full-page capture and page restore failed');

  expect(mocks.releaseLease).not.toHaveBeenCalled();
});

it('registers export cancellation before a queued capture starts', async () => {
  let queuedWork: (() => Promise<unknown>) | null = null;
  mocks.runExclusive.mockImplementationOnce((work: () => Promise<unknown>) => {
    queuedWork = work;
    return new Promise((resolve, reject) => {
      queueMicrotask(() => {
        void queuedWork?.().then(resolve, reject);
      });
    });
  });

  const capture = captureFullPageTransaction(44, undefined, {
    backendKind: 'native',
    documentId: 'document-4',
    exportRunId: 'batch-cancelled',
  });
  await Promise.resolve();
  expect(cancelFullPageCaptureByExportRunId('batch-cancelled')).toBe(true);

  await expect(capture).rejects.toThrow('Full-page capture cancelled');
  expect(mocks.acquireLease).not.toHaveBeenCalled();
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'Full-page capture cancelled',
  });
});

it('registers export cancellation before asynchronous job creation', async () => {
  let resolveJob: (value: { jobId: string }) => void = () => {
    throw new Error('Delayed capture job resolver is unavailable');
  };
  mocks.createJob.mockImplementationOnce(
    () =>
      new Promise<{ jobId: string }>((resolve) => {
        resolveJob = resolve;
      })
  );

  const capture = captureFullPageTransaction(144, undefined, {
    backendKind: 'native',
    documentId: 'document-144',
    exportRunId: 'batch-create-job-cancelled',
  });
  expect(cancelFullPageCaptureByExportRunId('batch-create-job-cancelled')).toBe(true);
  resolveJob({ jobId: 'job-delayed' });

  await expect(capture).rejects.toThrow('Full-page capture cancelled');
  expect(mocks.runExclusive).toHaveBeenCalledOnce();
  expect(mocks.acquireLease).not.toHaveBeenCalled();
  expect(mocks.transition).toHaveBeenCalledWith('job-delayed', 'failed', {
    error: 'Full-page capture cancelled',
  });
});

it('restores the page before final background encoding begins', async () => {
  const sequence: string[] = [];
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockImplementation(async () => {
      sequence.push('restore');
    }),
  };
  mocks.createAgent.mockReturnValue(agent);
  mocks.captureTiles.mockImplementationOnce(async (args: { beforeFinish(): Promise<void> }) => {
    await args.beforeFinish();
    sequence.push('encode');
    return { dataUrl: 'data:image/png;base64,encoded', metadata: {} };
  });

  await captureFullPageTransaction(145, undefined, {
    backendKind: 'native',
    documentId: 'document-145',
  });

  expect(sequence).toEqual(['restore', 'encode']);
  expect(agent.restore).toHaveBeenCalledOnce();
});

it('fails before acquiring privileged resources without a document binding', async () => {
  await expect(captureFullPageTransaction(45)).rejects.toThrow('document binding is unavailable');
  expect(mocks.acquireLease).not.toHaveBeenCalled();
  expect(mocks.createNative).not.toHaveBeenCalled();
});

it('preserves both capture and storage-lease cleanup failures', async () => {
  const captureFailure = new Error('prepare failed');
  const cleanupFailure = new Error('lease cleanup failed');
  mocks.createAgent.mockReturnValue({
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockRejectedValue(captureFailure),
    restore: vi.fn(),
  });
  mocks.releaseLease.mockRejectedValueOnce(cleanupFailure);

  await expect(
    captureFullPageTransaction(46, undefined, {
      backendKind: 'native',
      documentId: 'document-46',
    })
  ).rejects.toMatchObject({
    errors: [captureFailure, cleanupFailure],
    message: 'Full-page capture and cleanup failed',
  });
});

it('surfaces storage-lease cleanup failure after an otherwise successful capture', async () => {
  mocks.createAgent.mockReturnValue({
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  });
  mocks.captureTiles.mockImplementationOnce(async (args: { renewLease(): Promise<void> }) => {
    await args.renewLease();
    return { dataUrl: 'data:image/png;base64,ok', metadata: {} };
  });
  mocks.releaseLease.mockRejectedValueOnce(new Error('lease cleanup failed'));

  await expect(
    captureFullPageTransaction(47, undefined, {
      backendKind: 'native',
      documentId: 'document-47',
    })
  ).rejects.toThrow('Full-page capture cleanup failed');
  expect(mocks.renewLease).toHaveBeenCalledTimes(1);
});

it('rejects cancellation that arrives during the final rendering transition', async () => {
  let resolveRendering: () => void = () => undefined;
  mocks.transition.mockImplementation((_jobId: string, state: string) => {
    if (state !== 'rendering') return Promise.resolve(undefined);
    return new Promise<void>((resolve) => {
      resolveRendering = resolve;
    });
  });
  mocks.createAgent.mockReturnValue({
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  });
  mocks.captureTiles.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,cancelled-rendering',
    metadata: {
      cssHeight: 900,
      cssWidth: 800,
      downscaled: false,
      frozenExtentWarning: false,
      outputHeight: 900,
      outputScale: 1,
      outputWidth: 800,
      warnings: [],
    },
  });

  const capture = captureFullPageTransaction(148, undefined, {
    backendKind: 'native',
    documentId: 'document-148',
    exportRunId: 'batch-rendering-cancelled',
  });
  await vi.waitFor(() => {
    expect(mocks.transition).toHaveBeenCalledWith('job-1', 'rendering');
  });
  expect(cancelFullPageCaptureByExportRunId('batch-rendering-cancelled')).toBe(true);
  resolveRendering();

  await expect(capture).rejects.toThrow('Full-page capture cancelled');
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'Full-page capture cancelled',
  });
});
