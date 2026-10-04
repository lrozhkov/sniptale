// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../page-session/document.test-support';
import { createEditorSessionAutosaveService } from './';
import { createEditorControllerPublicApiMethods } from '../../controller/public-api/bindings/methods';
import { useEditorStore } from '../../state/useEditorStore';

const { commitWorkspaceMock } = vi.hoisted(() => ({ commitWorkspaceMock: vi.fn() }));
vi.mock('../../../composition/persistence/image-aggregates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/image-aggregates')>()),
  commitImageWorkspace: commitWorkspaceMock,
}));

beforeEach(() => {
  vi.useFakeTimers();
  commitWorkspaceMock.mockReset();
  commitWorkspaceMock.mockImplementation(async (input) => ({
    revision: input.expectedRevision + 1,
    documentAssetsByRuntimeUrl: new Map(),
  }));
});
afterEach(() => {
  useEditorStore.getState().setSaveState('idle');
  useEditorStore.getState().setSaveErrorMessage(null);
  useEditorStore.getState().setSessionId(null);
  vi.useRealTimers();
});

it('serializes caption history snapshots while an earlier save is pending', async () => {
  const autosave = createEditorSessionAutosaveService();
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation: null,
    sourceTitle: 'Capture',
    sourceUrl: null,
  });
  const publisher = createEditorControllerPublicApiMethods({
    autosaveService: autosave,
    syncRuntimeState: vi.fn(),
  } as never);
  let finishFirst: () => void = () => undefined;
  const firstWrite = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  let revision = 0;
  commitWorkspaceMock.mockImplementation(async (input) => {
    if (commitWorkspaceMock.mock.calls.length === 1) await firstWrite;
    if (input.expectedRevision !== revision) throw new Error('Stale workspace revision');
    revision += 1;
    return { revision, documentAssetsByRuntimeUrl: new Map() };
  });
  for (const displayName of ['First', 'Second', 'Third']) {
    publisher.publishHistoryDocument({ ...createEditorDocumentFixture(), displayName });
    await vi.advanceTimersByTimeAsync(2_000);
  }
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  finishFirst();
  await vi.advanceTimersByTimeAsync(0);
  expect(commitWorkspaceMock.mock.calls.map(([input]) => input.expectedRevision)).toEqual([
    0, 1, 2,
  ]);
  expect(commitWorkspaceMock.mock.calls.map(([input]) => input.sourceTitle)).toEqual([
    'First',
    'Second',
    'Third',
  ]);
  expect(autosave.getLastWriteError()).toBeNull();
  expect(autosave.getDurableRevision()).toBe(3);
  autosave.dispose();
});

function activate(autosave: ReturnType<typeof createEditorSessionAutosaveService>) {
  autosave.activate({
    aggregateId: 'image-1',
    durableRevision: 0,
    renderPresentation: null,
    sourceTitle: 'Capture',
    sourceUrl: null,
  });
}

function createDocument(sourceImageData: string) {
  return { ...createEditorDocumentFixture(), sourceImageData };
}

it('flushes edits arriving during the awaited write before allowing the document to close', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  let finishFirst: () => void = () => undefined;
  const firstWrite = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  commitWorkspaceMock.mockImplementationOnce(async () => {
    await firstWrite;
    return { revision: 1, documentAssetsByRuntimeUrl: new Map() };
  });
  let current = createDocument('first');
  const closing = autosave.flushAutosave(() => current);
  await vi.advanceTimersByTimeAsync(0);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  current = createDocument('newest');
  autosave.scheduleAutosave(current);
  finishFirst();
  await closing;
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ document: current, expectedRevision: 1 })
  );
  expect(autosave.hasUnsavedChanges()).toBe(false);
  autosave.dispose();
});

it('waits for the active gesture before flushing its final committed snapshot', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  autosave.setInteractionActive(true);
  let current = createDocument('before gesture');
  const closing = autosave.flushAutosave(() => current);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(commitWorkspaceMock).not.toHaveBeenCalled();
  expect(autosave.hasUnsavedChanges()).toBe(true);
  current = createDocument('finished gesture');
  autosave.scheduleAutosave(current);
  autosave.setInteractionActive(false);
  await closing;
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  expect(commitWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({ document: current }));
  expect(autosave.hasUnsavedChanges()).toBe(false);
  autosave.dispose();
});

it('refuses an old close flush when its in-flight atomic write finishes after a context switch', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  let finishWrite: () => void = () => undefined;
  commitWorkspaceMock.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    return { revision: 9, documentAssetsByRuntimeUrl: new Map() };
  });
  const closing = autosave.flushAutosave(() => createDocument('old'));
  const refused = expect(closing).rejects.toThrow('Editor document changed');
  await vi.advanceTimersByTimeAsync(0);
  autosave.activate({
    aggregateId: 'new-image',
    durableRevision: 2,
    renderPresentation: null,
    sourceTitle: null,
    sourceUrl: null,
  });
  autosave.scheduleAutosave(createDocument('new'));
  finishWrite();
  await refused;
  expect(autosave.getDurableRevision()).toBe(2);
  expect(autosave.hasUnsavedChanges()).toBe(true);
  autosave.dispose();
});

it('finishes the atomic write when input resumes, then saves the newest snapshot after release', async () => {
  const autosave = createEditorSessionAutosaveService();
  activate(autosave);
  let finishWrite: () => void = () => undefined;
  commitWorkspaceMock.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    return { revision: 1, documentAssetsByRuntimeUrl: new Map() };
  });
  autosave.scheduleAutosave(createDocument('first'));
  await vi.advanceTimersByTimeAsync(2_000);
  autosave.scheduleAutosave(createDocument('queued'));
  await vi.advanceTimersByTimeAsync(2_000);
  autosave.setInteractionActive(true);
  autosave.scheduleAutosave(createDocument('newest'));
  finishWrite();
  await vi.advanceTimersByTimeAsync(20_000);
  expect(commitWorkspaceMock).toHaveBeenCalledOnce();
  expect(autosave.getDurableRevision()).toBe(1);
  expect(autosave.hasUnsavedChanges()).toBe(true);
  autosave.setInteractionActive(false);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(commitWorkspaceMock).toHaveBeenCalledTimes(2);
  expect(commitWorkspaceMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ document: createDocument('newest'), expectedRevision: 1 })
  );
  expect(autosave.hasUnsavedChanges()).toBe(false);
  autosave.dispose();
});
