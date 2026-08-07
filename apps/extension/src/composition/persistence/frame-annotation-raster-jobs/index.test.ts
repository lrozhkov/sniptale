import { beforeEach, expect, it, vi } from 'vitest';
import { createFrameAnnotationSnapshot } from '../../../features/highlighter/frame-annotation';

const mocks = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  const store = {
    delete: vi.fn(async (key: string) => records.delete(key)),
    get: vi.fn(async (key: string) => records.get(key)),
    getAll: vi.fn(async () => [...records.values()]),
    getAllKeys: vi.fn(async () => [...records.keys()]),
    put: vi.fn(async (record: { jobId: string }) => records.set(record.jobId, record)),
  };
  const db = {
    delete: vi.fn(async (_name: string, key: string) => records.delete(key)),
    get: vi.fn(async (_name: string, key: string) => records.get(key)),
    transaction: vi.fn(() => ({
      abort: vi.fn(),
      done: Promise.resolve(),
      objectStore: () => store,
    })),
  };
  return { db, records, store };
});

vi.mock('../infrastructure/indexed-db/core', () => ({
  FRAME_ANNOTATION_RASTER_JOBS_STORE: 'frame_annotation_raster_jobs',
  initDB: async () => mocks.db,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: typeof mocks.db) => unknown) =>
    operation(mocks.db),
}));

import {
  acquireFrameAnnotationRasterInput,
  completeFrameAnnotationRasterJob,
  consumeFrameAnnotationRasterOutput,
  stageFrameAnnotationRasterJob,
} from '.';

const input = {
  baseImage: new Blob(['base'], { type: 'image/png' }),
  height: 50,
  snapshots: [],
  width: 100,
};

beforeEach(() => mocks.records.clear());

it('stages, validates, completes, and atomically consumes a raster job', async () => {
  const reference = await stageFrameAnnotationRasterJob({ input, jobId: 'job-1', revision: 4 });
  await expect(acquireFrameAnnotationRasterInput(reference)).resolves.toEqual(input);
  await completeFrameAnnotationRasterJob(reference, new Blob(['output'], { type: 'image/png' }), {
    downscaled: false,
    outputHeight: 50,
    outputScale: 1,
    outputWidth: 100,
  });
  await expect(consumeFrameAnnotationRasterOutput(reference)).resolves.toMatchObject({
    metadata: { outputWidth: 100 },
  });
  expect(mocks.records.has('job-1')).toBe(false);
});

it('digests snapshots by canonical value instead of caller property order', async () => {
  const snapshot = createFrameAnnotationSnapshot(
    { id: 'frame-order', x: 1, y: 2, width: 30, height: 20 },
    0
  );
  const orderedInput = { ...input, snapshots: [snapshot] };
  const reference = await stageFrameAnnotationRasterJob({
    input: orderedInput,
    jobId: 'job-order',
    revision: 1,
  });

  await expect(acquireFrameAnnotationRasterInput(reference)).resolves.toMatchObject({
    snapshots: [{ id: 'frame-order' }],
  });
});

it('rejects a reference whose digest no longer matches the staged payload', async () => {
  const reference = await stageFrameAnnotationRasterJob({ input, jobId: 'job-2', revision: 1 });
  await expect(
    acquireFrameAnnotationRasterInput({ ...reference, inputSha256: '0'.repeat(64) })
  ).rejects.toThrow('integrity');
});

it('rejects aggregate input above 64 MiB before persistence', async () => {
  const oversized = {
    ...input,
    baseImage: new Blob([new Uint8Array(64 * 1024 * 1024)], { type: 'image/png' }),
  };
  await expect(
    stageFrameAnnotationRasterJob({ input: oversized, jobId: 'job-large', revision: 1 })
  ).rejects.toThrow('exceeds 64 MiB');
  expect(mocks.records.has('job-large')).toBe(false);
});

it('rejects non-PNG input before persistence and at the stored-record boundary', async () => {
  await expect(
    stageFrameAnnotationRasterJob({
      input: { ...input, baseImage: new Blob(['svg'], { type: 'image/svg+xml' }) },
      jobId: 'job-svg',
      revision: 1,
    })
  ).rejects.toThrow('Invalid frame annotation raster input');

  const reference = await stageFrameAnnotationRasterJob({ input, jobId: 'job-png', revision: 1 });
  const stored = mocks.records.get('job-png') as Record<string, unknown>;
  mocks.records.set('job-png', {
    ...stored,
    input: { ...input, baseImage: new Blob(['svg'], { type: 'image/svg+xml' }) },
  });
  await expect(acquireFrameAnnotationRasterInput(reference)).rejects.toThrow('integrity');
});

it('rejects future, oversized, and out-of-bounds records at the IDB read boundary', async () => {
  const reference = await stageFrameAnnotationRasterJob({
    input,
    jobId: 'job-boundary',
    revision: 1,
  });
  const original = mocks.records.get('job-boundary') as Record<string, unknown>;

  mocks.records.set('job-boundary', { ...original, createdAt: Date.now() + 60_000 });
  await expect(acquireFrameAnnotationRasterInput(reference)).rejects.toThrow('integrity');

  mocks.records.set('job-boundary', {
    ...original,
    output: new Blob(['output'], { type: 'image/png' }),
    outputMetadata: {
      downscaled: false,
      outputHeight: 16_384,
      outputScale: 1,
      outputWidth: 16_384,
    },
    outputSha256: '0'.repeat(64),
  });
  await expect(acquireFrameAnnotationRasterInput(reference)).rejects.toThrow('integrity');

  mocks.records.set('job-boundary', {
    ...original,
    input: {
      ...input,
      baseImage: new Blob([new Uint8Array(64 * 1024 * 1024)], { type: 'image/png' }),
    },
  });
  await expect(acquireFrameAnnotationRasterInput(reference)).rejects.toThrow('integrity');
});

it('rejects oversized or dimensionally invalid output before persistence', async () => {
  const reference = await stageFrameAnnotationRasterJob({
    input,
    jobId: 'job-output',
    revision: 1,
  });
  await expect(
    completeFrameAnnotationRasterJob(reference, new Blob(['output'], { type: 'image/png' }), {
      downscaled: false,
      outputHeight: 16_384,
      outputScale: 1,
      outputWidth: 16_384,
    })
  ).rejects.toThrow('Invalid frame annotation raster output');
});

it('accepts a resource-bounded output scale above 32', async () => {
  const reference = await stageFrameAnnotationRasterJob({
    input,
    jobId: 'job-large-scale',
    revision: 1,
  });
  await expect(
    completeFrameAnnotationRasterJob(reference, new Blob(['output'], { type: 'image/png' }), {
      downscaled: false,
      outputHeight: 2_000,
      outputScale: 40,
      outputWidth: 4_000,
    })
  ).resolves.toBeUndefined();
  await expect(consumeFrameAnnotationRasterOutput(reference)).resolves.toMatchObject({
    metadata: { outputScale: 40 },
  });
});

it('rejects non-PNG output before persistence and at the stored-record boundary', async () => {
  const reference = await stageFrameAnnotationRasterJob({
    input,
    jobId: 'job-output-mime',
    revision: 1,
  });
  await expect(
    completeFrameAnnotationRasterJob(reference, new Blob(['output'], { type: 'image/webp' }), {
      downscaled: false,
      outputHeight: 50,
      outputScale: 1,
      outputWidth: 100,
    })
  ).rejects.toThrow('Invalid frame annotation raster output');

  const stored = mocks.records.get('job-output-mime') as Record<string, unknown>;
  mocks.records.set('job-output-mime', {
    ...stored,
    output: new Blob(['output'], { type: 'image/webp' }),
    outputMetadata: { downscaled: false, outputHeight: 50, outputScale: 1, outputWidth: 100 },
    outputSha256: '0'.repeat(64),
  });
  await expect(consumeFrameAnnotationRasterOutput(reference)).rejects.toThrow('integrity');
});
