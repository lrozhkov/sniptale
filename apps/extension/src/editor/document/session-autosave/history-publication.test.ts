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
