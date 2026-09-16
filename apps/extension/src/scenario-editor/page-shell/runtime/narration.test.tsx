// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { useGuidePageState } from './use-state';
const io = vi.hoisted(() => ({ load: vi.fn(), attach: vi.fn(), save: vi.fn() }));
vi.mock('./resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: io.load,
}));
vi.mock('../../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: async () => undefined,
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  importScenarioNarration: io.attach,
  saveScenarioProjectRecord: io.save,
}));
vi.mock('../../platform/browser-driver', () => ({ replaceScenarioEditorSelectionInUrl: vi.fn() }));
let state: ReturnType<typeof useGuidePageState>;
let root: Root;
let host: HTMLDivElement;
function Probe() {
  state = useGuidePageState();
  return null;
}
function fixture() {
  const project = createGuideProject('Guide', 'guide', 1);
  project.tour = createTourDocument();
  project.tour.slides = [createTourImageSlide('first')];
  return project;
}
function command() {
  return {
    kind: 'narration' as const,
    input: {
      slideId: 'first',
      expectedNarration: null,
      blob: new Blob(['voice'], { type: 'audio/webm' }),
      signal: new AbortController().signal,
    },
  };
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  io.load.mockResolvedValue({ versions: [{ project: fixture(), revision: 1, savedAt: 1 }] });
  io.attach.mockImplementation(async ({ project }) => {
    const next = structuredClone(project);
    next.updatedAt = 2;
    next.tour.slides[0].narration = {
      assetId: 'audio',
      duration: 2,
      trimStart: 0,
      trimEnd: 2,
      gain: 1,
      transcript: '',
    };
    return next;
  });
  io.save.mockImplementation(async (project) => ({ ...project, updatedAt: 3 }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('adopts one revisioned narration publication into the existing Undo history', async () => {
  await act(async () => {
    expect(await state.commitChange(command())).toBe(true);
  });
  expect(io.attach).toHaveBeenCalledWith(
    expect.objectContaining({ baseUpdatedAt: 1, slideId: 'first' })
  );
  expect(state.project?.tour?.slides[0]?.narration?.assetId).toBe('audio');
  expect(state.canUndo).toBe(true);
  act(() => state.undo());
  expect(state.project?.tour?.slides[0]?.narration).toBeNull();
});
it('retains the current narration on failure and admits retry', async () => {
  io.attach.mockRejectedValueOnce(new Error('quota'));
  await act(async () => {
    expect(await state.commitChange(command())).toBe(false);
  });
  expect(state.actionError).toBe('import');
  expect(state.project?.tour?.slides[0]?.narration).toBeNull();
  await act(async () => {
    expect(await state.commitChange(command())).toBe(true);
  });
  expect(state.project?.tour?.slides[0]?.narration?.assetId).toBe('audio');
});
it('rejects duplicate pending narration commits and ignores late completion after unmount', async () => {
  let finish!: (project: ReturnType<typeof fixture>) => void;
  io.attach.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = state.commitChange(command());
    expect(await state.commitChange(command())).toBe(false);
  });
  expect(io.attach).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => {
    finish({ ...fixture(), updatedAt: 2 });
    expect(await pending).toBe(false);
  });
  expect(state.project?.updatedAt).toBe(1);
});
it('reports a stale aggregate revision without replacing local content', async () => {
  const error = new Error('stale');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.attach.mockRejectedValue(error);
  await act(async () => {
    expect(await state.commitChange(command())).toBe(false);
  });
  expect(state.status).toBe('conflict');
  expect(state.project?.tour?.slides[0]?.narration).toBeNull();
});
