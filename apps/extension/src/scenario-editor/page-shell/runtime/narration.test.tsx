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
const io = vi.hoisted(() => ({
  load: vi.fn(),
  attach: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
}));
vi.mock('./resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: io.load,
}));
vi.mock('../../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: io.read,
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  importScenarioNarration: io.attach,
  listScenarioProjectSummaries: io.list,
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
  io.read.mockResolvedValue(undefined);
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

it('loads attached narration into player media URLs and releases it on Undo', async () => {
  const create = vi.fn(() => 'blob:attached-voice');
  const revoke = vi.fn();
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  io.read.mockResolvedValue(new Blob(['voice'], { type: 'audio/webm' }));
  await act(async () => {
    expect(await state.commitChange(command())).toBe(true);
  });
  expect(io.read).toHaveBeenCalledWith('audio');
  expect(state.images['audio']).toBe('blob:attached-voice');
  await act(async () => state.undo());
  expect(state.images['audio']).toBeUndefined();
  expect(revoke).toHaveBeenCalledWith('blob:attached-voice');
});

function mediaURLs() {
  let index = 0;
  const create = vi.fn(() => `blob:voice-${++index}`);
  const revoke = vi.fn();
  const NativeURL = URL;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  return { create, revoke };
}
it('deduplicates slide and object narration and leaves detached audio unloaded', async () => {
  mediaURLs();
  io.read.mockResolvedValue(new Blob(['voice'], { type: 'audio/webm' }));
  const attach = io.attach.getMockImplementation()!;
  io.attach.mockImplementation(async (args) => {
    const next = await attach(args);
    const slide = next.tour.slides[0];
    slide.annotations = [
      {
        id: 'note',
        text: 'Note',
        anchor: null,
        appearance: null,
        narration: { ...slide.narration, trigger: 'activation' },
      },
    ];
    next.tour.audioResources = [{ assetId: 'unused', duration: 2, name: 'Unused' }];
    next.tour.backgroundMusic = {
      assetId: 'audio',
      duration: 2,
      volume: 0.3,
      loop: true,
      ducking: { enabled: true, level: 0.25 },
    };
    return next;
  });
  await act(async () => {
    await state.commitChange(command());
  });
  expect(io.read.mock.calls).toEqual([['audio']]);
  expect(state.images['audio']).toBe('blob:voice-1');
});
it('ignores narration reads completed after Undo', async () => {
  const urls = mediaURLs();
  let finish!: (blob: Blob) => void;
  io.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => {
    await state.commitChange(command());
  });
  expect(io.read).toHaveBeenCalledWith('audio');
  await act(async () => state.undo());
  await act(async () => finish(new Blob(['late'], { type: 'audio/webm' })));
  expect(urls.create).not.toHaveBeenCalled();
  expect(state.images['audio']).toBeUndefined();
});
it('releases and reacquires the same media IDs when opening another project', async () => {
  const urls = mediaURLs();
  io.read.mockResolvedValue(new Blob(['voice'], { type: 'audio/webm' }));
  await act(async () => {
    await state.commitChange(command());
  });
  const next = structuredClone(state.project!);
  next.id = 'other';
  io.list.mockResolvedValue([{ id: 'other', availability: 'available' }]);
  io.load.mockResolvedValue({ versions: [{ project: next, revision: 1, savedAt: 1 }] });
  await act(async () => state.openExisting('other'));
  expect(urls.revoke).toHaveBeenCalledWith('blob:voice-1');
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(state.images['audio']).toBe('blob:voice-2');
});

it('loads music-only URLs and releases them when the binding is undone', async () => {
  const urls = mediaURLs();
  io.read.mockResolvedValue(new Blob(['music'], { type: 'audio/wav' }));
  io.attach.mockImplementation(async ({ project }) => {
    const next = structuredClone(project);
    next.updatedAt = 2;
    next.tour.backgroundMusic = {
      assetId: 'music',
      duration: 2,
      volume: 0.3,
      loop: true,
      ducking: { enabled: true, level: 0.25 },
    };
    return next;
  });
  await act(async () => {
    await state.commitChange(command());
  });
  expect(io.read.mock.calls).toEqual([['music']]);
  expect(state.images['music']).toBe('blob:voice-1');
  await act(async () => state.undo());
  expect(urls.revoke).toHaveBeenCalledWith('blob:voice-1');
  expect(state.images['music']).toBeUndefined();
});

it('discards late music bytes after undo without creating a stale object URL', async () => {
  const urls = mediaURLs();
  let finish!: (blob: Blob) => void;
  io.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  io.attach.mockImplementation(async ({ project }) => ({
    ...project,
    updatedAt: 2,
    tour: {
      ...project.tour,
      backgroundMusic: {
        assetId: 'music',
        duration: 2,
        volume: 0.3,
        loop: true,
        ducking: { enabled: true, level: 0.25 },
      },
    },
  }));
  await act(async () => {
    await state.commitChange(command());
  });
  expect(io.read).toHaveBeenCalledWith('music');
  await act(async () => state.undo());
  await act(async () => finish(new Blob(['late'], { type: 'audio/wav' })));
  expect(urls.create).not.toHaveBeenCalled();
  expect(state.images['music']).toBeUndefined();
});
