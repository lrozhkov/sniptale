// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  listScenarioNarrationTexts,
} from '../../../features/scenario/project/public';
import { useGuidePageState } from './use-state';
import type { ScenarioNarrationPreview } from '../../../workflows/scenario-narration/generation';
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
  const slide = createTourImageSlide('first');
  slide.actions = [
    {
      type: 'annotation',
      object: {
        id: 'first-action',
        text: 'Read this',
        anchor: null,
        appearance: null,
        narration: null,
      },
    },
  ];
  slide.actions.push({
    type: 'annotation',
    object: {
      id: 'second-action',
      text: 'Second text',
      anchor: null,
      appearance: null,
      narration: null,
    },
  });
  project.tour.slides = [slide];
  return project;
}
function command() {
  return {
    kind: 'narration' as const,
    input: {
      slideId: 'first',
      objectId: 'first-action',
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
  io.load.mockResolvedValue({
    currentRevision: 1,
    versions: [{ project: fixture(), revision: 1, savedAt: 1 }],
  });
  io.attach.mockImplementation(async ({ project, objectId }) => {
    const next = structuredClone(project);
    next.updatedAt = 2;
    next.tour.slides[0].actions.find(
      ({ object }: { object: { id: string } }) => object.id === objectId
    ).object.narration = {
      assetId: 'audio',
      duration: 2,
      trimStart: 0,
      trimEnd: 2,
      gain: 1,
      transcript: '',
      trigger: 'enter',
    };
    return { project: next, workspaceRevision: 2 };
  });
  io.save.mockImplementation(async (project) => ({
    project: { ...project, updatedAt: 3 },
    workspaceRevision: 2,
  }));
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
function currentNarration() {
  const slide = state.project?.tour?.slides[0];
  return slide?.kind === 'image' ? slide.actions[0]?.object.narration : undefined;
}
it('adopts one revisioned narration publication into the existing Undo history', async () => {
  await act(async () => {
    expect(await state.commitChange(command())).toBe(true);
  });
  expect(io.attach).toHaveBeenCalledWith(
    expect.objectContaining({ baseUpdatedAt: 1, slideId: 'first', objectId: 'first-action' })
  );
  expect(currentNarration()?.assetId).toBe('audio');
  expect(state.canUndo).toBe(true);
  act(() => state.undo());
  expect(currentNarration()).toBeNull();
});
it('retains the current narration on failure and admits retry', async () => {
  io.attach.mockRejectedValueOnce(new Error('quota'));
  await act(async () => {
    expect(await state.commitChange(command())).toBe(false);
  });
  expect(state.actionError).toBe('import');
  expect(currentNarration()).toBeNull();
  await act(async () => {
    expect(await state.commitChange(command())).toBe(true);
  });
  expect(currentNarration()?.assetId).toBe('audio');
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
  expect(currentNarration()).toBeNull();
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
it('deduplicates two action narrations and music while leaving detached audio unloaded', async () => {
  mediaURLs();
  io.read.mockResolvedValue(new Blob(['voice'], { type: 'audio/webm' }));
  const attach = io.attach.getMockImplementation()!;
  io.attach.mockImplementation(async (args) => {
    const { project: next, workspaceRevision } = await attach(args);
    const slide = next.tour.slides[0];
    slide.actions.push({
      type: 'annotation',
      object: {
        id: 'note',
        text: 'Note',
        anchor: null,
        appearance: null,
        narration: { ...slide.actions[0].object.narration, trigger: 'enter' },
      },
    });
    next.tour.audioResources = [{ assetId: 'unused', duration: 2, name: 'Unused' }];
    next.tour.backgroundMusic = {
      assetId: 'audio',
      duration: 2,
      volume: 0.3,
      loop: true,
      ducking: { enabled: true, level: 0.25 },
    };
    return { project: next, workspaceRevision };
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
  io.load.mockResolvedValue({
    currentRevision: 1,
    versions: [{ project: next, revision: 1, savedAt: 1 }],
  });
  await act(async () => state.openExisting('other'));
  expect(urls.revoke).toHaveBeenCalledWith('blob:voice-1');
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(state.images['audio']).toBe('blob:voice-2');
});

it('refuses an old resource callback after a same-id A/B/A document round trip', async () => {
  const oldCommit = state.commitChange;
  const original = structuredClone(state.project!);
  const other = { ...original, id: 'other' };
  io.list.mockResolvedValue([
    { id: 'other', availability: 'available' },
    { id: original.id, availability: 'available' },
  ]);
  io.load
    .mockResolvedValueOnce({
      currentRevision: 17,
      versions: [{ project: other, revision: 17, savedAt: 1 }],
    })
    .mockResolvedValueOnce({
      currentRevision: 37,
      versions: [{ project: { ...original, name: 'Reopened A' }, revision: 37, savedAt: 1 }],
    });
  await act(async () => state.openExisting('other'));
  await act(async () => state.openExisting(original.id));
  await act(async () => expect(await oldCommit(command())).toBe(false));
  expect(io.attach).not.toHaveBeenCalled();
  expect(state.project?.name).toBe('Reopened A');
});

it('discards a pending resource acknowledgement after opening another document', async () => {
  const original = structuredClone(state.project!);
  let finish!: (snapshot: { project: typeof original; workspaceRevision: number }) => void;
  io.attach.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = state.commitChange(command());
  });
  const other = { ...original, id: 'other', name: 'Other document' };
  io.list.mockResolvedValue([{ id: other.id, availability: 'available' }]);
  io.load.mockResolvedValue({
    currentRevision: 37,
    versions: [{ project: other, revision: 37, savedAt: 1 }],
  });
  await act(async () => state.openExisting(other.id));
  await act(async () => {
    finish({ project: { ...original, name: 'Late old document' }, workspaceRevision: 59 });
    expect(await pending).toBe(false);
  });
  expect(state.project?.id).toBe(other.id);
  expect(state.project?.name).toBe(other.name);
  expect(state.status).toBe('saved');
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
    return { project: next, workspaceRevision: 2 };
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
    project: {
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
    },
    workspaceRevision: 2,
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

function preview(): ScenarioNarrationPreview {
  return {
    scope: {
      workspaceId: state.project!.id,
      workspaceRevision: 1,
      target: { kind: 'scenario-text', slideId: 'first', objectId: 'first-action' },
      sourceTextHash: 'frozen-hash',
    },
    text: 'Read this',
    expectedNarration: null,
    blob: new Blob(['generated'], { type: 'audio/wav' }),
    url: 'blob:preview',
    staged: { id: 'staged', mimeType: 'audio/wav', size: 9 },
    duration: 2,
  };
}
function changeText(text: string) {
  const next = structuredClone(state.project!);
  const slide = next.tour!.slides[0]!;
  if (slide.kind === 'image') slide.actions[0]!.object.text = text;
  state.update(next);
}
it('explicitly saves narration source while autosave is disabled', async () => {
  act(() => {
    state.setAutosaveEnabled(false);
    changeText('Saved source');
  });
  const targets = listScenarioNarrationTexts(state.project!);
  await act(async () => {
    const snapshot = await state.prepareNarration(targets, new AbortController().signal);
    expect(snapshot.workspaceRevision).toBe(2);
    expect(listScenarioNarrationTexts(snapshot.project)[0]!.text).toBe('Saved source');
  });
  expect(io.save).toHaveBeenCalledOnce();
});
it('blocks Scenario generation when explicit source save fails', async () => {
  act(() => {
    state.setAutosaveEnabled(false);
    changeText('Unsaved source');
  });
  io.save.mockRejectedValueOnce(new Error('quota'));
  const startPaidJob = vi.fn();
  await act(async () => {
    await state
      .prepareNarration(listScenarioNarrationTexts(state.project!), new AbortController().signal)
      .then(startPaidJob)
      .catch(() => undefined);
  });
  expect(startPaidJob).not.toHaveBeenCalled();
  expect(io.attach).not.toHaveBeenCalled();
  expect(listScenarioNarrationTexts(state.project!)[0]!.text).toBe('Unsaved source');
});
it('refuses changed source during explicit save before paid generation', async () => {
  act(() => {
    state.setAutosaveEnabled(false);
    changeText('Captured source');
  });
  let finish!: (value: {
    project: NonNullable<typeof state.project>;
    workspaceRevision: number;
  }) => void;
  io.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const source = state.project!;
  let result!: Promise<unknown>;
  await act(async () => {
    result = state
      .prepareNarration(listScenarioNarrationTexts(source), new AbortController().signal)
      .catch((error: unknown) => error);
    await Promise.resolve();
  });
  act(() => changeText('Newer source'));
  await act(async () => {
    finish({ project: { ...source, updatedAt: 4 }, workspaceRevision: 2 });
    expect(await result).toBeInstanceOf(Error);
  });
  expect(io.attach).not.toHaveBeenCalled();
});
it('requires current explicit Apply for an exactly matching restored source', async () => {
  const generated = preview();
  act(() => {
    state.setAutosaveEnabled(false);
    changeText('Changed');
  });
  await act(async () =>
    expect(await state.applyNarration(generated, new AbortController().signal)).toBe(false)
  );
  expect(io.attach).not.toHaveBeenCalled();
  act(() => state.undo());
  await act(async () =>
    expect(await state.applyNarration(generated, new AbortController().signal)).toBe(true)
  );
  expect(io.attach).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedSource: { text: 'Read this', sourceTextHash: 'frozen-hash' },
      blob: generated.blob,
    })
  );
});
it('retries refused AI Apply without regenerating audio', async () => {
  const generated = preview();
  const apply = state.applyNarration;
  io.attach.mockRejectedValueOnce(new Error('quota'));
  await act(async () => {
    expect(await apply(generated, new AbortController().signal)).toBe(false);
    expect(await apply(generated, new AbortController().signal)).toBe(true);
  });
  expect(io.attach).toHaveBeenCalledTimes(2);
  expect(io.attach.mock.calls[0]![0].blob).toBe(generated.blob);
  expect(io.attach.mock.calls[1]![0].blob).toBe(generated.blob);
});
it('applies ready batch previews with the latest accepted revision for each import', async () => {
  const first = preview();
  const apply = state.applyNarration;
  const second = {
    ...first,
    text: 'Second text',
    scope: { ...first.scope, target: { ...first.scope.target, objectId: 'second-action' } },
  };
  await act(async () => {
    expect(await apply(first, new AbortController().signal)).toBe(true);
    expect(await apply(second, new AbortController().signal)).toBe(true);
  });
  expect(io.attach.mock.calls.map(([input]) => input.expectedRevision)).toEqual([1, 2]);
  expect(
    io.attach.mock.calls[1]![0].project.tour.slides[0].actions[0].object.narration.assetId
  ).toBe('audio');
  expect(io.save).not.toHaveBeenCalled();
});
it('retains accepted batch imports and failed previews after partial Apply All failure', async () => {
  const generated = preview();
  const apply = state.applyNarration;
  const next = {
    ...generated,
    text: 'Second text',
    scope: { ...generated.scope, target: { ...generated.scope.target, objectId: 'second-action' } },
  };
  const attach = io.attach.getMockImplementation()!;
  io.attach.mockImplementationOnce(attach).mockRejectedValueOnce(new Error('quota'));
  await act(async () => {
    expect(await apply(generated, new AbortController().signal)).toBe(true);
    expect(await apply(next, new AbortController().signal)).toBe(false);
  });
  expect(currentNarration()?.assetId).toBe('audio');
  expect(state.project?.updatedAt).toBe(2);
  expect(state.canUndo).toBe(true);
});
