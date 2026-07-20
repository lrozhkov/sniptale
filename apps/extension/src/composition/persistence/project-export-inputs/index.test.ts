import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLargeEffectProject } from './index.test-support';

const mocks = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  const abort = vi.fn();
  const store = {
    delete: vi.fn(async (jobId: string) => records.delete(jobId)),
    get: vi.fn(async (jobId: string) => records.get(jobId)),
    getAll: vi.fn(async () => [...records.values()]),
    put: vi.fn(async (value: { jobId: string }) => records.set(value.jobId, value)),
  };
  const db = {
    delete: vi.fn(async (_storeName: string, jobId: string) => records.delete(jobId)),
    get: vi.fn(async (_storeName: string, jobId: string) => records.get(jobId)),
    transaction: vi.fn(() => ({ abort, done: Promise.resolve(), objectStore: () => store })),
  };
  return { abort, db, records, store };
});

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: async () => mocks.db,
  PROJECT_EXPORT_INPUTS_STORE: 'project_export_inputs',
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: typeof mocks.db) => unknown) =>
    operation(mocks.db),
}));

import {
  cleanupExpiredProjectExportInputs,
  consumeProjectExportInput,
  deleteProjectExportInput,
  loadProjectExportInput,
  stageProjectExportInput,
} from './index';

beforeEach(() => {
  mocks.records.clear();
  mocks.abort.mockClear();
  mocks.store.delete.mockClear();
  mocks.store.get.mockClear();
  mocks.store.getAll.mockClear();
  mocks.store.put.mockClear();
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn(async () => ({ quota: 1024 ** 3, usage: 0 })) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('hands off an EffectV1 project larger than the runtime message blob ceiling', async () => {
  const project = await createLargeEffectProject();

  const reference = await stageProjectExportInput('job-large', project, 100);

  expect(reference.retainedByteLength).toBeGreaterThan(2 * 1024 * 1024);
  expect(JSON.stringify(reference).length).toBeLessThan(512);
  await expect(loadProjectExportInput(reference, 100)).resolves.toEqual(project);
  const stored = expectRecord(mocks.records.get('job-large'));
  const storedProject = expectRecord(stored['project']);
  const snapshot = expectRecord(expectArray(storedProject['effectSnapshots'])[0]);
  const asset = expectRecord(expectArray(snapshot['assets'])[0]);
  expect(asset['blob']).toBeInstanceOf(Blob);
});

it('atomically consumes one job-scoped input and rejects a replay', async () => {
  const reference = await stageProjectExportInput(
    'job-consume',
    await createLargeEffectProject(),
    100
  );

  await expect(consumeProjectExportInput(reference, 100)).resolves.toMatchObject({
    id: 'project-1',
  });
  expect(mocks.records.has('job-consume')).toBe(false);
  await expect(consumeProjectExportInput(reference, 100)).rejects.toMatchObject({
    code: 'inputMissing',
  });
});

it('rejects content tampering and never overwrites another payload for the same job', async () => {
  const project = await createLargeEffectProject();
  const reference = await stageProjectExportInput('job-locked', project, 100);
  const stored = expectRecord(mocks.records.get('job-locked'));
  const storedProject = expectRecord(stored['project']);
  storedProject['name'] = 'tampered';

  await expect(loadProjectExportInput(reference, 100)).rejects.toMatchObject({
    code: 'inputIntegrityFailure',
  });
  await expect(stageProjectExportInput('job-locked', project, 101)).rejects.toMatchObject({
    code: 'jobConflict',
  });
  expect(mocks.abort).toHaveBeenCalledOnce();
});

it('rejects invalid project authority, malformed references, and insufficient quota', async () => {
  const project = await createLargeEffectProject();

  await expect(
    stageProjectExportInput('job-invalid', { ...project, clips: [] })
  ).rejects.toMatchObject({ code: 'inputIntegrityFailure' });
  await expect(
    loadProjectExportInput({
      contentSha256: 'a'.repeat(64),
      jobId: '',
      projectId: project.id,
      retainedByteLength: 1,
    })
  ).rejects.toMatchObject({ code: 'inputIntegrityFailure' });

  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn(async () => ({ quota: 1, usage: 1 })) },
  });
  await expect(stageProjectExportInput('job-quota', project)).rejects.toMatchObject({
    code: 'quotaExceeded',
  });
});

it('rejects malformed storage collections and enforces retained input capacity', async () => {
  const project = await createLargeEffectProject();
  mocks.store.getAll.mockImplementationOnce(async () => ({ malformed: true }) as never);

  await expect(stageProjectExportInput('job-malformed', project, 100)).rejects.toMatchObject({
    code: 'inputIntegrityFailure',
  });

  mocks.records.clear();
  for (let index = 0; index < 4; index += 1) {
    mocks.records.set(`retained-${index}`, { createdAt: 100, jobId: `retained-${index}` });
  }
  await expect(stageProjectExportInput('job-capacity', project, 100)).rejects.toMatchObject({
    code: 'capacityExceeded',
  });
});

it('removes stale entries and supports explicit cleanup of staged inputs', async () => {
  const project = await createLargeEffectProject();
  mocks.records.set('stale', { createdAt: -1, jobId: 'stale' });

  await stageProjectExportInput('job-cleanup', project, 100);
  expect(mocks.records.has('stale')).toBe(false);

  await deleteProjectExportInput('job-cleanup');
  expect(mocks.records.has('job-cleanup')).toBe(false);
});

it('fails expired load and consume closed without write-on-read repair', async () => {
  const project = await createLargeEffectProject();
  const reference = await stageProjectExportInput('job-expired', project, 100);
  const expiredAt = 100 + 24 * 60 * 60 * 1_000 + 1;

  await expect(loadProjectExportInput(reference, expiredAt)).rejects.toMatchObject({
    code: 'inputMissing',
  });
  expect(mocks.records.has('job-expired')).toBe(true);
  await expect(consumeProjectExportInput(reference, expiredAt)).rejects.toMatchObject({
    code: 'inputMissing',
  });
  expect(mocks.records.has('job-expired')).toBe(false);
});

it('removes orphaned expired inputs during startup maintenance without another stage', async () => {
  const project = await createLargeEffectProject();
  await stageProjectExportInput('job-orphan', project, 100);

  await cleanupExpiredProjectExportInputs(100 + 24 * 60 * 60 * 1_000 + 1);

  expect(mocks.records.has('job-orphan')).toBe(false);
  expect(mocks.store.put).toHaveBeenCalledOnce();
});

function expectRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected record');
  return value;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
