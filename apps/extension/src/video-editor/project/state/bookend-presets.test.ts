import { resolveVideoProjectCompositionJoinPlans } from '../../../features/video/project/scene/joins';
import { getFittedMediaContentFrame } from '../../../features/video/composition/draw/fitted-media';
import { getClipAudioGain } from '../../../features/video/project/timeline/presentation.gain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { isExportReadyVideoProject } from '../../../features/video/project/validation/root';
import {
  createVideoProjectBookendPresets,
  selectVideoProjectBookendMaterial,
} from '../../../features/video/project/scene/bookend-presets';
import { createBookendImagePresentation } from '../../../features/video/project/scene/bookend-media';
import {
  beginVideoEditorProjectHistoryTransaction,
  endVideoEditorProjectHistoryTransaction,
  undoVideoEditorProjectHistory,
  redoVideoEditorProjectHistory,
} from '../history';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import { createVideoAsset } from './test-support';

afterEach(() => vi.restoreAllMocks());
function setup(output?: { width: number; height: number }) {
  const store = createVideoEditorProjectTestStore();
  const project = createEmptyVideoProject();
  if (output) Object.assign(project, output);
  const asset = createVideoAsset('Source');
  asset.metadata.width = 641;
  asset.metadata.height = 359;
  project.assets = [asset];
  store.getState().setProject(project);
  store.getState().appendMaterial(asset.id);
  const current = store.getState().project!;
  const slot = selectVideoProjectBookendMaterial({ mode: 'none' }, asset);
  if (!slot) throw new Error('Expected video recipe');
  return {
    store,
    project: current,
    asset,
    presets: { ...createVideoProjectBookendPresets(), intro: slot },
  };
}

describe('accepted Native bookend recipe edits', () => {
  it('stores independent recipes in one history step and never edits existing instances', () => {
    const { store, project, presets } = setup();
    const before = store.getState();
    expect(before.updateBookendPresets(presets, project)).toEqual({ status: 'updated' });
    const after = store.getState();
    expect(after.project?.version).toBe(25);
    expect(after.project?.clips).toEqual(project.clips);
    expect(after.project?.assets).toEqual(project.assets);
    expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
    const undo = undoVideoEditorProjectHistory(
      after.projectHistory,
      after.project!,
      after.selection
    );
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.bookendPresets).toBeUndefined();
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.bookendPresets).toEqual(presets);
    expect(redo.project.clips).toEqual(project.clips);
    expect(after.updateBookendPresets(presets, after.project!)).toEqual({ status: 'unchanged' });
    expect(store.getState()).toBe(after);
  });

  it('rejects stale recipe edit after a competing root edit', () => {
    const { store, project, presets } = setup();
    store.getState().renameProject('Concurrent edit');
    const before = store.getState();
    expect(before.updateBookendPresets(presets, project)).toEqual({
      status: 'rejected',
      reason: 'stale-project',
    });
    expect(store.getState()).toBe(before);
    expect(before.project?.name).toBe('Concurrent edit');
  });

  it('rejects old snapshot after same-id recreation', () => {
    const { store, project, presets } = setup();
    store.getState().setProject(structuredClone(project));
    const before = store.getState();
    expect(before.project?.id).toBe(project.id);
    expect(before.updateBookendPresets(presets, project)).toEqual({
      status: 'rejected',
      reason: 'stale-project',
    });
    expect(store.getState()).toBe(before);
  });

  it('refuses foreign history lease without ending it', () => {
    const { store, project, presets } = setup();
    store.setState({
      projectHistory: beginVideoEditorProjectHistoryTransaction(
        store.getState().projectHistory,
        project
      ),
    });
    const before = store.getState();
    expect(before.updateBookendPresets(presets, project)).toEqual({
      status: 'rejected',
      reason: 'history-busy',
    });
    expect(store.getState()).toBe(before);
    expect(store.getState().projectHistory.transaction).toBe(before.projectHistory.transaction);
  });

  it('retains accepted recipe after history snapshot failure', () => {
    const { store, project, presets } = setup();
    const before = store.getState();
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(() => {
      throw new Error('No snapshot');
    });
    expect(before.updateBookendPresets(presets, project)).toEqual({
      status: 'rejected',
      reason: 'history-unavailable',
    });
    expect(store.getState()).toBe(before);
    expect(store.getState().project).toBe(project);
  });

  it('admits retry with a fresh idle snapshot after refusal', () => {
    const { store, project, presets } = setup();
    store.setState({
      projectHistory: beginVideoEditorProjectHistoryTransaction(
        store.getState().projectHistory,
        project
      ),
    });
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('rejected');
    store.setState({
      projectHistory: endVideoEditorProjectHistoryTransaction(
        store.getState().projectHistory,
        project
      ),
    });
    expect(store.getState().updateBookendPresets(presets, store.getState().project!)).toEqual({
      status: 'updated',
    });
  });

  it('refuses malformed and missing remembered references without changing root or history', () => {
    const { store, project, presets } = setup();
    const before = store.getState();
    const missing = {
      ...presets,
      outro: {
        mode: 'image' as const,
        image: { ...createBookendImagePresentation(), assetId: 'missing' },
      },
    };
    expect(before.updateBookendPresets(missing, project)).toEqual({
      status: 'rejected',
      reason: 'invalid-project',
    });
    expect(store.getState()).toBe(before);
    expect(
      before.updateBookendPresets(
        {
          ...presets,
          intro: {
            mode: 'video',
            video: {
              assetId: project.assets[0]!.id,
              fit: 'contain',
              fillColor: '#000000ff',
              crop: { panX: 0, panY: 0 },
              trim: { start: 5, end: 1 },
              audio: { muted: false, gain: 1 },
            },
          },
        },
        project
      ).status
    ).toBe('rejected');
    expect(store.getState()).toBe(before);
  });

  it('clears authoring without downgrading schema or removing materials and has a no-project refusal', () => {
    const { store, project, presets } = setup();
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
    const current = store.getState().project!;
    expect(store.getState().updateBookendPresets(undefined, current)).toEqual({
      status: 'updated',
    });
    expect(store.getState().project?.version).toBe(25);
    expect(store.getState().project?.bookendPresets).toBeUndefined();
    expect(store.getState().project?.assets).toEqual(project.assets);
    store.setState({ project: null });
    const before = store.getState();
    expect(before.updateBookendPresets(presets, project)).toEqual({
      status: 'rejected',
      reason: 'no-project',
    });
    expect(store.getState()).toBe(before);
  });
});

describe('preset to independent ordinary instance', () => {
  it.each(['contain', 'cover'] as const)(
    'places fractional %s framing with an ordinary opaque fill',
    (fit) => {
      const { store, project, presets, asset } = setup({ width: 321, height: 181 });
      if (presets.intro.mode !== 'video') throw new Error('Expected video preset');
      presets.intro.video = {
        ...presets.intro.video,
        fit,
        fillColor: '#123456ff',
        crop: { panX: 0.75, panY: -0.6 },
        trim: { start: 1, end: 3.5 },
        audio: { muted: false, gain: 0.37 },
      };
      expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
      const accepted = store.getState().project!;
      const history = store.getState().projectHistory.past.length;
      const placed = store.getState().placeBookendMaterial(asset.id, 'intro', accepted);
      expect(placed.status).toBe('placed');
      if (placed.status !== 'placed') throw new Error('Expected placement');
      const next = store.getState().project!;
      const clip = next.clips.find(({ id }) => id === placed.clipId);
      if (!clip || clip.type !== 'VIDEO') throw new Error('Expected video clip');
      expect(clip.sourceStart).toBe(1);
      expect(clip.sourceDuration).toBe(2.5);
      expect(clip.duration).toBe(2.5);
      const old = next.clips.find(({ id }) => id === project.clips[0]!.id)!;
      expect(old.startTime).toBe(project.clips[0]!.startTime + 2.5);
      const content = getFittedMediaContentFrame({
        frame: clip.transform,
        fitMode: clip.fitMode,
        ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
        sourceWidth: 641,
        sourceHeight: 359,
      });
      if (fit === 'contain') {
        expect(content.x).toBeCloseTo(0, 9);
        expect(content.y).toBeCloseTo(0.609984399375975, 9);
        expect(content.width).toBeCloseTo(321, 9);
        expect(content.height).toBeCloseTo(179.78003120124805, 9);
      } else {
        expect(content.x).toBeCloseTo(-1.9059888579387188, 9);
        expect(content.y).toBeCloseTo(0, 9);
        expect(content.width).toBeCloseTo(323.1782729805014, 9);
        expect(content.height).toBeCloseTo(181, 9);
      }
      const fill = next.clips.find(
        (item) => item.type === 'SHAPE' && item.groupId === clip.groupId
      );
      expect(fill).toMatchObject({
        duration: 2.5,
        startTime: 0,
        transform: { x: 0, y: 0, width: 321, height: 181 },
        style: { fillColor: '#123456ff', strokeWidth: 0, borderRadius: 0 },
      });
      const audio = next.clips.find(
        (item) => item.type === 'AUDIO' && item.groupId === clip.groupId
      )!;
      expect(getClipAudioGain(audio, 1)).toBeCloseTo(0.37, 6);
      expect(next.assets).toEqual(project.assets);
      expect(next.bookendPresets).toEqual(presets);
      expect(store.getState().projectHistory.past).toHaveLength(history + 1);
    }
  );

  it('keeps template authoring independent from a speed edit of the inserted instance', () => {
    const { store, project, presets, asset } = setup();
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
    const result = store
      .getState()
      .placeBookendMaterial(asset.id, 'intro', store.getState().project!);
    if (result.status !== 'placed') throw new Error('Expected placement');
    store.getState().updateClipPlaybackRate(result.clipId, 1.37);
    store.getState().updateClipPlaybackRate(result.clipId, 2);
    const changed = store.getState().project!;
    expect(changed.bookendPresets).toEqual(presets);
    expect(changed.clips.find(({ id }) => id === result.clipId)?.duration).toBe(3);
    const clips = structuredClone(changed.clips);
    expect(
      store
        .getState()
        .updateBookendPresets({ ...presets, intro: { ...presets.intro, mode: 'none' } }, changed)
        .status
    ).toBe('updated');
    expect(store.getState().project?.clips).toEqual(clips);
  });

  it('splits linked fill and media into independently editable groups', () => {
    const { store, project, presets, asset } = setup();
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
    const placed = store
      .getState()
      .placeBookendMaterial(asset.id, 'intro', store.getState().project!);
    if (placed.status !== 'placed') throw new Error('Expected placement');
    store.getState().splitClipAt(placed.clipId, 2);
    const split = store.getState().project!;
    const trailing = split.clips.find((clip) => clip.type === 'VIDEO' && clip.startTime === 2);
    if (!trailing) throw new Error('Expected trailing video');
    const leading = split.clips.filter(
      (clip) => clip.groupId && clip.groupId !== trailing.groupId && clip.startTime === 0
    );
    expect(leading).toHaveLength(3);
    expect(leading.every((clip) => clip.duration === 2)).toBe(true);
    store.getState().updateClipPlaybackRate(trailing.id, 2);
    const edited = store.getState().project!;
    const group = edited.clips.filter((clip) => clip.groupId === trailing.groupId);
    expect(group).toHaveLength(3);
    expect(group.every((clip) => clip.startTime === 2 && clip.duration === 2)).toBe(true);
    expect(edited.clips.filter((clip) => leading.some(({ id }) => id === clip.id))).toEqual(
      leading
    );
    expect(edited.bookendPresets).toEqual(presets);
  });

  it('respects fill-track neighbors and lock refusal through speed edit and retry', () => {
    const { store, project, presets, asset } = setup();
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
    const placed = store
      .getState()
      .placeBookendMaterial(asset.id, 'intro', store.getState().project!);
    if (placed.status !== 'placed') throw new Error('Expected placement');
    const current = store.getState().project!;
    const fill = current.clips.find((clip) => clip.type === 'SHAPE');
    if (!fill) throw new Error('Expected fill');
    const locked = {
      ...current,
      tracks: current.tracks.map((track) =>
        track.id === fill.trackId ? { ...track, locked: true } : track
      ),
    };
    store.getState().setProject(locked);
    const before = store.getState();
    store.getState().updateClipPlaybackRate(placed.clipId, 2);
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().projectHistory).toBe(before.projectHistory);
    const neighbor = { ...fill, id: 'fill-neighbor', groupId: null, startTime: 6 };
    store.getState().setProject({ ...current, clips: [...current.clips, neighbor] });
    const acceptedNeighbor = store.getState().project!.clips.find(({ id }) => id === neighbor.id);
    store.getState().updateClipPlaybackRate(placed.clipId, 2);
    expect(store.getState().project?.clips.find(({ id }) => id === fill.id)?.duration).toBe(3);
    store.getState().updateClipPlaybackRate(placed.clipId, 0.1);
    expect(store.getState().project?.clips.find(({ id }) => id === fill.id)?.duration).toBe(6);
    expect(store.getState().project?.clips.find(({ id }) => id === neighbor.id)).toEqual(
      acceptedNeighbor
    );
  });

  it('places an extreme-aspect image with its authored duration and bounded editable crop', () => {
    const { store, project } = setup({ width: 321, height: 181 });
    const image = createVideoProjectAsset(
      'Wide image',
      'IMAGE',
      { kind: 'project-asset', projectAssetId: 'wide-bytes' },
      {
        width: 16384,
        height: 1,
        duration: null,
        mimeType: 'image/png',
        size: 100,
        hasAudio: false,
        audioPeaks: null,
      }
    );
    store.getState().setProject({ ...project, assets: [...project.assets, image] });
    const accepted = store.getState().project!;
    const presets = {
      ...createVideoProjectBookendPresets(),
      outro: {
        mode: 'image' as const,
        image: {
          ...createBookendImagePresentation(),
          assetId: image.id,
          fit: 'cover' as const,
          duration: 7.3,
          crop: { panX: 1, panY: -1 },
        },
      },
    };
    expect(store.getState().updateBookendPresets(presets, accepted).status).toBe('updated');
    const before = store.getState().project!;
    const result = store.getState().placeBookendMaterial(image.id, 'outro', before);
    if (result.status !== 'placed') throw new Error('Expected image placement');
    const next = store.getState().project!;
    const clip = next.clips.find(({ id }) => id === result.clipId);
    expect(clip).toMatchObject({
      type: 'IMAGE',
      duration: 7.3,
      startTime: before.duration,
      transform: { x: 0, y: 0, width: 321, height: 181 },
      sourceCrop: { height: 1, y: 0 },
    });
    expect(isExportReadyVideoProject(next)).toBe(true);
    expect(next.clips.filter((item) => before.clips.some(({ id }) => id === item.id))).toEqual(
      before.clips
    );
    expect(next.assets).toEqual(before.assets);
  });

  it('retains refusal for a linked shape whose bounds differ from its source', () => {
    const { store, project, presets, asset } = setup();
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
    const placed = store
      .getState()
      .placeBookendMaterial(asset.id, 'intro', store.getState().project!);
    if (placed.status !== 'placed') throw new Error('Expected placement');
    const current = store.getState().project!;
    store.getState().setProject({
      ...current,
      clips: current.clips.map((clip) =>
        clip.type === 'SHAPE' ? { ...clip, duration: clip.duration - 1 } : clip
      ),
    });
    const before = store.getState();
    store.getState().updateClipPlaybackRate(placed.clipId, 2);
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().projectHistory).toBe(before.projectHistory);
  });

  it('refuses a sub-frame configured range without publishing partial clips or history', () => {
    const { store, project, presets, asset } = setup();
    if (presets.intro.mode !== 'video') throw new Error('Expected video preset');
    presets.intro.video.trim = { start: 1, end: 1.001 };
    expect(store.getState().updateBookendPresets(presets, project).status).toBe('updated');
    const before = store.getState();
    expect(before.placeBookendMaterial(asset.id, 'intro', before.project!)).toEqual({
      status: 'rejected',
      reason: 'invalid-range',
    });
    expect(store.getState()).toBe(before);
  });
});

it('preserves a placed join window through an ordinary short-tail split and history replay', () => {
  const { store, project, presets, asset } = setup();
  const recipe = {
    ...presets,
    introTransition: { type: 'dissolve' as const, before: 1, after: 0.2 },
  };
  expect(store.getState().updateBookendPresets(recipe, project).status).toBe('updated');
  const placed = store
    .getState()
    .placeBookendMaterial(asset.id, 'intro', store.getState().project!);
  if (placed.status !== 'placed') throw new Error('Expected placement');
  const before = store.getState().project!;
  const clip = before.clips.find(({ id }) => id === placed.clipId)!;
  const plan = resolveVideoProjectCompositionJoinPlans(before)[0]!;
  store.getState().splitClipAt(placed.clipId, clip.startTime + clip.duration - 0.1);
  const after = store.getState();
  const split = after.project!;
  expect(split.compositionJoins![0]!.clipId).not.toBe(placed.clipId);
  expect(resolveVideoProjectCompositionJoinPlans(split)[0]).toMatchObject({
    before: plan.before,
    after: plan.after,
    seam: plan.seam,
  });
  expect(split.duration).toBe(before.duration);
  const undo = undoVideoEditorProjectHistory(after.projectHistory, split, after.selection);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(resolveVideoProjectCompositionJoinPlans(undo.project)).toEqual([plan]);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(resolveVideoProjectCompositionJoinPlans(redo.project)).toEqual(
    resolveVideoProjectCompositionJoinPlans(split)
  );
});
