import { beforeEach, expect, it, vi } from 'vitest';
import {
  observeVideoEditorSave,
  publishVideoEditorSaveReadiness,
  waitForVideoEditorSave,
  registerVideoEditorSaveBarrier,
  prepareVideoEditorCheckpointExit,
} from './save-readiness';

let generation = Symbol();
let version = 0;
function publish(snapshot: {
  projectId: string;
  saveState: Parameters<typeof publishVideoEditorSaveReadiness>[0]['saveState'];
}) {
  if (snapshot.saveState === 'dirty' || snapshot.saveState === 'saving') version += 1;
  publishVideoEditorSaveReadiness({
    ...snapshot,
    generation,
    requestedVersion: version,
    savedVersion: snapshot.saveState === 'saved' ? version : 0,
  });
}

beforeEach(() => {
  generation = Symbol();
  version = 0;
  publish({ projectId: 'project-1', saveState: 'saved' });
});

it('retains the replacement writer when a stale lease cleans up', async () => {
  const old = registerVideoEditorSaveBarrier(
    'project-1',
    Symbol(),
    vi.fn(async () => undefined)
  );
  const flush = vi.fn(async () => undefined);
  const current = registerVideoEditorSaveBarrier('project-1', generation, flush);
  try {
    old();
    await waitForVideoEditorSave('project-1');
    expect(flush).toHaveBeenCalledOnce();
  } finally {
    current();
  }
});

it('rejects a transition whose mounted writer is replaced during its barrier', async () => {
  let release: () => void = () => undefined;
  const cleanup = registerVideoEditorSaveBarrier(
    'project-1',
    generation,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const waiting = waitForVideoEditorSave('project-1');
  cleanup();
  release();
  await expect(waiting).rejects.toThrow('open video project changed');
});

it('returns immediately for the matching saved project', async () => {
  await expect(waitForVideoEditorSave('project-1')).resolves.toBeUndefined();
});

it('waits for an in-progress save to settle', async () => {
  publish({ projectId: 'project-1', saveState: 'saving' });
  const settled = waitForVideoEditorSave('project-1');

  publish({ projectId: 'project-1', saveState: 'saved' });

  await expect(settled).resolves.toBeUndefined();
});

it('waits through the dirty debounce before persistence starts', async () => {
  publish({ projectId: 'project-1', saveState: 'dirty' });
  const settled = waitForVideoEditorSave('project-1');

  publish({ projectId: 'project-1', saveState: 'saving' });
  publish({ projectId: 'project-1', saveState: 'saved' });

  await expect(settled).resolves.toBeUndefined();
});

it('rejects when saving fails or the open project changes', async () => {
  publish({ projectId: 'project-1', saveState: 'saving' });
  const failed = waitForVideoEditorSave('project-1');
  publish({ projectId: 'project-1', saveState: 'error' });
  await expect(failed).rejects.toThrow('could not be saved');

  publish({ projectId: 'project-1', saveState: 'saving' });
  const changed = waitForVideoEditorSave('project-1');
  publish({ projectId: 'project-2', saveState: 'saved' });
  await expect(changed).rejects.toThrow('could not be saved');
});

it('waits for the next mutation save rather than an earlier saved state', async () => {
  const cycle = observeVideoEditorSave('project-1');
  let settled = false;
  void cycle.promise.then(() => {
    settled = true;
  });
  publish({ projectId: 'project-1', saveState: 'saved' });
  await Promise.resolve();
  expect(settled).toBe(false);
  publish({ projectId: 'project-1', saveState: 'dirty' });
  publish({ projectId: 'project-1', saveState: 'saving' });
  publish({ projectId: 'project-1', saveState: 'saved' });
  await expect(cycle.promise).resolves.toBeUndefined();
});

it('does not accept an old saved status for a newer edit version', async () => {
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 2,
    savedVersion: 0,
    saveState: 'dirty',
  });
  const waiting = waitForVideoEditorSave('project-1');
  let settled = false;
  void waiting.then(() => {
    settled = true;
  });
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 2,
    savedVersion: 1,
    saveState: 'saved',
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 3,
    savedVersion: 2,
    saveState: 'dirty',
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 3,
    savedVersion: 3,
    saveState: 'saved',
  });
  await expect(waiting).resolves.toBeUndefined();
});

it('observes the next edit version and ignores acknowledgement of an earlier write', async () => {
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 1,
    savedVersion: 0,
    saveState: 'saving',
  });
  const cycle = observeVideoEditorSave('project-1');
  let settled = false;
  void cycle.promise.then(() => {
    settled = true;
  });
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 2,
    savedVersion: 0,
    saveState: 'dirty',
  });
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 2,
    savedVersion: 1,
    saveState: 'saved',
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation,
    requestedVersion: 3,
    savedVersion: 2,
    saveState: 'dirty',
  });
  await expect(cycle.promise).resolves.toBeUndefined();
});

it('rejects replacement of the same project with a new session generation', async () => {
  publish({ projectId: 'project-1', saveState: 'dirty' });
  const waiting = waitForVideoEditorSave('project-1');
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation: Symbol(),
    requestedVersion: 0,
    savedVersion: 0,
    saveState: 'saved',
  });
  await expect(waiting).rejects.toThrow('could not be saved');
});

it('prepares exact exit observations without changing the ordinary save barrier', async () => {
  const receipt = {
    rootKind: 'video-project' as const,
    rootId: 'project-1',
    revision: '11111111-1111-4111-8111-111111111111',
  };
  let eligible = true;
  const cleanup = registerVideoEditorSaveBarrier(
    'project-1',
    generation,
    async () => undefined,
    () => ({ receipt, isCurrent: () => eligible })
  );
  try {
    await expect(waitForVideoEditorSave('project-1')).resolves.toBeUndefined();
    const exit = await prepareVideoEditorCheckpointExit('project-1');
    expect(exit.receipt).toEqual(receipt);
    expect(exit.isCurrent()).toBe(true);
    eligible = false;
    expect(exit.isCurrent()).toBe(false);
  } finally {
    cleanup();
  }
});

it('invalidates an exit witness for new versions or replacement', async () => {
  const cleanup = registerVideoEditorSaveBarrier(
    'project-1',
    generation,
    async () => undefined,
    () => ({ receipt: null, isCurrent: () => true })
  );
  const exit = await prepareVideoEditorCheckpointExit('project-1');
  expect(exit.isCurrent()).toBe(true);
  publish({ projectId: 'project-1', saveState: 'dirty' });
  expect(exit.isCurrent()).toBe(false);
  publish({ projectId: 'project-1', saveState: 'saved' });
  const newer = await prepareVideoEditorCheckpointExit('project-1');
  const replacement = registerVideoEditorSaveBarrier(
    'project-1',
    generation,
    async () => undefined,
    () => ({ receipt: null, isCurrent: () => true })
  );
  expect(newer.isCurrent()).toBe(false);
  cleanup();
  replacement();
});

it('gives legacy registrations no exit authority', async () => {
  const cleanup = registerVideoEditorSaveBarrier('project-1', generation, async () => undefined);
  try {
    const exit = await prepareVideoEditorCheckpointExit('project-1');
    expect(exit.receipt).toBeNull();
    expect(exit.isCurrent()).toBe(false);
    await expect(waitForVideoEditorSave('project-1')).resolves.toBeUndefined();
  } finally {
    cleanup();
  }
});

it('refuses replacement during exit preparation and an ineligible provider before issuing receipt', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cleanup = registerVideoEditorSaveBarrier('project-1', generation, () => waiting);
  const pending = prepareVideoEditorCheckpointExit('project-1');
  cleanup();
  release();
  await expect(pending).rejects.toThrow('changed');
  const current = registerVideoEditorSaveBarrier(
    'project-1',
    generation,
    async () => undefined,
    () => null
  );
  try {
    const exit = await prepareVideoEditorCheckpointExit('project-1');
    expect(exit.receipt).toBeNull();
    expect(exit.isCurrent()).toBe(false);
  } finally {
    current();
  }
});

it('invalidates an exit witness after a same-project generation replacement or writer cleanup', async () => {
  const cleanup = registerVideoEditorSaveBarrier(
    'project-1',
    generation,
    async () => undefined,
    () => ({ receipt: null, isCurrent: () => true })
  );
  const exit = await prepareVideoEditorCheckpointExit('project-1');
  publishVideoEditorSaveReadiness({
    projectId: 'project-1',
    generation: Symbol(),
    saveState: 'saved',
    requestedVersion: 0,
    savedVersion: 0,
  });
  expect(exit.isCurrent()).toBe(false);
  cleanup();
  expect(exit.isCurrent()).toBe(false);
});
