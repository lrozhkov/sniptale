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
vi.mock('./capture-parts', () => ({
  captureAndStitchFullPageTiles: mocks.captureTiles,
  FULL_PAGE_EXTENT_GREW_ERROR: 'Full-page capture extent grew during capture',
}));
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

it('always preloads lazy content for an export capture even when interactive capture disables it', async () => {
  mocks.loadSettings.mockResolvedValueOnce({
    fullPageCapture: {
      floatingElements: 'hide',
      freezeMotion: false,
      preloadLazyContent: false,
    },
  });
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValue(agent);
  mocks.captureTiles.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,export',
    metadata: {},
  });

  await captureFullPageTransaction(42, undefined, {
    backendKind: 'native',
    documentId: 'document-2',
    exportRunId: 'export-2',
  });

  expect(agent.prepare).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      floatingElements: 'hide',
      freezeMotion: false,
      preloadLazyContent: true,
    }),
    expect.any(Object)
  );
});

it('retries once when the viewport changes before the first raster tile is committed', async () => {
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValue(agent);
  mocks.captureTiles
    .mockRejectedValueOnce(new Error('Full-page capture viewport changed during capture'))
    .mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,stabilized',
      metadata: {},
    });

  await expect(
    captureFullPageTransaction(152, undefined, {
      backendKind: 'native',
      documentId: 'document-152',
      exportRunId: 'viewport-stabilization-retry',
    })
  ).resolves.toEqual(expect.objectContaining({ dataUrl: 'data:image/png;base64,stabilized' }));

  expect(agent.prepare).toHaveBeenCalledTimes(2);
  expect(agent.restore).toHaveBeenCalledTimes(2);
  expect(mocks.captureTiles).toHaveBeenCalledTimes(2);
});

it('falls back to a visible viewport after persistent viewport changes', async () => {
  const failure = 'Full-page capture viewport changed during capture';
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  const raster = {
    captureFrame: vi.fn().mockResolvedValue('data:image/png;base64,viewport'),
    release: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValue(agent);
  mocks.createNative.mockResolvedValue(raster);
  mocks.captureTiles
    .mockImplementationOnce(
      async (args: { onProgress?: (current: number, total: number) => void }) => {
        args.onProgress?.(1, 3);
        throw new Error(failure);
      }
    )
    .mockRejectedValueOnce(new Error(failure));

  await expect(
    captureFullPageTransaction(153, undefined, {
      backendKind: 'native',
      documentId: 'document-153',
    })
  ).resolves.toEqual(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,viewport',
      metadata: expect.objectContaining({
        cssHeight: 500,
        cssWidth: 800,
        warnings: expect.arrayContaining([expect.stringContaining('visible viewport')]),
      }),
    })
  );

  expect(agent.prepare).toHaveBeenCalledTimes(3);
  expect(agent.restore).toHaveBeenCalledTimes(3);
  expect(mocks.captureTiles).toHaveBeenCalledTimes(2);
  expect(raster.captureFrame).toHaveBeenCalledOnce();
});

it('keeps the complete frozen plan when page extent continues growing after restart', async () => {
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValue(agent);
  mocks.captureTiles
    .mockRejectedValueOnce(new Error('Full-page capture extent grew during capture'))
    .mockImplementationOnce(async (args: { restartOnExtentGrowth?: boolean }) => {
      expect(args.restartOnExtentGrowth).toBe(false);
      return {
        dataUrl: 'data:image/png;base64,frozen-full-page',
        metadata: { frozenExtentWarning: true },
      };
    });

  await expect(
    captureFullPageTransaction(155, undefined, {
      backendKind: 'native',
      documentId: 'document-155',
    })
  ).resolves.toEqual(
    expect.objectContaining({ dataUrl: 'data:image/png;base64,frozen-full-page' })
  );

  expect(agent.prepare).toHaveBeenCalledTimes(2);
  expect(agent.restore).toHaveBeenCalledTimes(2);
  expect(mocks.captureTiles).toHaveBeenCalledTimes(2);
});

it('restarts once after extent growth while keeping published progress monotonic', async () => {
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-1', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  const onProgress = vi.fn();
  mocks.createAgent.mockReturnValue(agent);
  mocks.captureTiles
    .mockImplementationOnce(
      async (args: { onProgress?: (current: number, total: number) => void }) => {
        args.onProgress?.(1, 3);
        throw new Error('Full-page capture extent grew during capture');
      }
    )
    .mockImplementationOnce(
      async (args: { onProgress?: (current: number, total: number) => void }) => {
        args.onProgress?.(1, 4);
        args.onProgress?.(2, 4);
        return { dataUrl: 'data:image/png;base64,restabilized', metadata: {} };
      }
    );

  await expect(
    captureFullPageTransaction(154, onProgress, {
      backendKind: 'native',
      documentId: 'document-154',
    })
  ).resolves.toEqual(expect.objectContaining({ dataUrl: 'data:image/png;base64,restabilized' }));

  expect(onProgress.mock.calls).toEqual([
    [1, 3],
    [2, 4],
  ]);
  expect(agent.prepare).toHaveBeenCalledTimes(2);
  expect(agent.restore).toHaveBeenCalledTimes(2);
});

it('releases the storage lease and marks the job failed when page preparation rejects', async () => {
  const error = new Error('prepare failed');
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockRejectedValue(error),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValue(agent);

  await expect(
    captureFullPageTransaction(43, undefined, {
      backendKind: 'native',
      documentId: 'document-3',
    })
  ).rejects.toBe(error);

  expect(agent.restore).toHaveBeenCalledOnce();
  expect(mocks.releaseLease).toHaveBeenCalledTimes(1);
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'failed', {
    error: 'prepare failed',
  });
});

it('restores an in-flight page preparation immediately when the export is cancelled', async () => {
  const agent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn(() => new Promise(() => undefined)),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValue(agent);

  const capture = captureFullPageTransaction(149, undefined, {
    backendKind: 'native',
    documentId: 'document-149',
    exportRunId: 'batch-preparation-cancelled',
  });
  await vi.waitFor(() => expect(agent.prepare).toHaveBeenCalledOnce());

  expect(cancelFullPageCaptureByExportRunId('batch-preparation-cancelled')).toBe(true);

  await expect(capture).rejects.toThrow('Full-page capture cancelled');
  expect(agent.restore).toHaveBeenCalledOnce();
  expect(mocks.releaseLease).toHaveBeenCalledOnce();
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'cancelled', {});
});

it('allows a new capture after cancelling and restoring an in-flight preparation', async () => {
  const cancelledAgent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn(() => new Promise(() => undefined)),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  const restartedAgent = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    prepare: vi.fn().mockResolvedValue({ geometry, layoutGeneration: 'layout-2', warnings: [] }),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  mocks.createAgent.mockReturnValueOnce(cancelledAgent).mockReturnValueOnce(restartedAgent);
  mocks.captureTiles.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,restarted',
    metadata: {},
  });

  const cancelled = captureFullPageTransaction(150, undefined, {
    backendKind: 'native',
    documentId: 'document-150',
    exportRunId: 'batch-before-restart',
  });
  await vi.waitFor(() => expect(cancelledAgent.prepare).toHaveBeenCalledOnce());
  cancelFullPageCaptureByExportRunId('batch-before-restart');
  await expect(cancelled).rejects.toThrow('Full-page capture cancelled');

  await expect(
    captureFullPageTransaction(150, undefined, {
      backendKind: 'native',
      documentId: 'document-150',
      exportRunId: 'batch-after-restart',
    })
  ).resolves.toEqual(expect.objectContaining({ dataUrl: 'data:image/png;base64,restarted' }));
  expect(restartedAgent.prepare).toHaveBeenCalledOnce();
  expect(mocks.releaseLease).toHaveBeenCalledTimes(2);
});

it('bounds page preparation and restores the page when the content agent does not reply', async () => {
  vi.useFakeTimers();
  try {
    const agent = {
      heartbeat: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn(() => new Promise(() => undefined)),
      restore: vi.fn().mockResolvedValue(undefined),
    };
    mocks.createAgent.mockReturnValue(agent);

    const capture = captureFullPageTransaction(151, undefined, {
      backendKind: 'native',
      documentId: 'document-151',
    });
    const rejection = expect(capture).rejects.toThrow(
      'Full-page capture page preparation timed out'
    );
    await vi.waitFor(() => expect(agent.prepare).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(35_000);

    await rejection;
    expect(agent.restore).toHaveBeenCalledOnce();
    expect(mocks.releaseLease).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
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
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'cancelled', {});
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
  expect(mocks.transition).toHaveBeenCalledWith('job-delayed', 'cancelled', {});
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
  expect(mocks.transition).toHaveBeenCalledWith('job-1', 'cancelled', {});
});
