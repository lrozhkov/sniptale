import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectTrack } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import {
  bindMotionRegionToClip,
  projectMotionSourceBinding,
} from '../../../../features/video/project/motion/source-binding';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { isHydratableVideoProject } from '../../../../features/video/project/validation/root';
import { projectVideoProjectTextFragment } from '../../../../features/video/project/text/projection';
import { projectVideoProjectCommentAnchor } from '../../../../features/video/project/comments/projection';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import type { VideoProject } from '../../../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../../../features/video/project/text/types';
import type { VideoProjectEffectSnapshot } from '../../../../features/video/project/effect-instance/types';
import {
  beginVideoEditorProjectHistoryTransaction,
  endVideoEditorProjectHistoryTransaction,
  undoVideoEditorProjectHistory,
  redoVideoEditorProjectHistory,
} from '../../history';
import { setup } from './material.test-support';
import { createBookendVideoPresentation } from '../../../../features/video/project/scene/bookend-media';
import { createVideoProjectBookendPresets } from '../../../../features/video/project/scene/bookend-presets';

afterEach(() => vi.restoreAllMocks());
function populated() {
  const result = setup();
  result.asset.source = {
    kind: 'project-asset',
    projectAssetId: 'source',
    originRecordingId: 'recording',
  };
  result.store.getState().appendMaterial(result.asset.id);
  return result;
}
function completeComposition() {
  const result = populated();
  const project = result.store.getState().project!;
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'instance';
  const sourceBinding = {
    kind: 'source' as const,
    assetId: clip.assetId,
    sourceInstanceId: 'instance',
  };
  const sourceText: VideoProjectTextDocument = {
    id: 'source-text',
    binding: sourceBinding,
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Two words',
          originalText: 'Two words',
          start: 1,
          end: 3,
          revision: 2,
          timingRevision: 4,
          timeDomain: 'source',
          showInVideo: true,
          alignment: 'word',
          words: [
            { text: 'Two', start: 1, end: 2 },
            { text: 'words', start: 2, end: 3 },
          ],
          origin: { kind: 'original', start: 1, end: 3 },
        },
      ],
    },
  };
  const text = {
    ...sourceText,
    id: 'project-text',
    binding: { kind: 'project' as const },
    document: {
      ...sourceText.document,
      fragments: sourceText.document.fragments.map((fragment) => ({
        ...fragment,
        timeDomain: 'result' as const,
      })),
    },
  };
  const region = { ...createVideoProjectMotionRegion(project, 1), duration: 2 };
  const next: VideoProject = {
    ...project,
    version: 24,
    textDocuments: [text, sourceText],
    commentDocuments: [
      {
        id: 'project-notes',
        binding: { kind: 'project' },
        annotations: [
          { id: 'note', text: 'Editorial note', anchor: { kind: 'range', start: 1, end: 3 } },
        ],
        canvasComments: [],
      },
      {
        id: 'source-notes',
        binding: sourceBinding,
        annotations: [{ id: 'note', text: 'Source note', anchor: { kind: 'point', time: 2 } }],
        canvasComments: [],
      },
    ],
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'cursor',
          time: 2,
          x: 0.5,
          y: 0.5,
          visible: true,
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: 'recording',
            sourceClipId: clip.id,
            sourceTime: 2,
          },
        },
      ],
    },
    objectTracks: [
      {
        id: 'object',
        kind: 'object',
        source: 'visualDetection',
        samples: [
          { sourceClipId: clip.id, time: 2, x: 0.5, y: 0.5, visible: true, confidence: 0.8 },
        ],
        correctionAnchors: [{ id: 'correction', sourceClipId: clip.id, time: 3, x: 0.4, y: 0.4 }],
        analysis: {
          sourceClipId: clip.id,
          sourceAssetId: clip.assetId,
          projectStartTime: 1,
          projectEndTime: 4,
          sampleFps: 12,
        },
      },
    ],
    motionRegions: [
      region,
      projectMotionSourceBinding(
        project,
        bindMotionRegionToClip({ ...region, id: 'source-motion' }, clip)
      ),
    ],
    actionEvents: [
      {
        id: 'manual',
        kind: 'CLICK',
        label: 'Manual',
        point: null,
        data: {},
        anchor: { kind: 'project', time: 2 },
      },
      {
        id: 'recorded',
        kind: 'CLICK',
        label: 'Recorded',
        point: null,
        data: {},
        anchor: {
          kind: 'recording-source',
          recordingId: 'recording',
          sourceInstanceId: 'instance',
          sourceEventId: 'event',
          sourceTime: 2,
        },
      },
    ],
    cursorFocusPath: {
      version: 1,
      smoothing: 0.5,
      sensitivity: 0.5,
      mode: 'follow',
      gapPolicy: 'hold',
      segments: [
        {
          id: 'manual-focus',
          binding: { kind: 'project' },
          start: 1,
          end: 3,
          keys: [{ id: 'key', time: 2, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'smooth' }],
        },
        {
          id: 'source-focus',
          binding: {
            kind: 'recording-source',
            recordingId: 'recording',
            sourceInstanceId: 'instance',
          },
          start: 3,
          end: 5,
          keys: [
            {
              id: 'source-key',
              time: 4,
              x: 0.5,
              y: 0.5,
              anchor: 'manual',
              interpolation: 'smooth',
            },
          ],
        },
      ],
    },
  };
  expect(isHydratableVideoProject(next)).toBe(true);
  result.store.setState({ project: next });
  return { ...result, project: next };
}
function targetSnapshot(): VideoProjectEffectSnapshot {
  const fixtureRoot = new URL(
    '../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/',
    import.meta.url
  );
  const source = readFileSync(
    new URL('neutral-target-effect.sniptale-effect.json', fixtureRoot),
    'utf8'
  );
  return {
    id: `effect:${'a'.repeat(64)}`,
    sha256: 'a'.repeat(64),
    documentId: 'neutral-target-effect',
    schemaVersion: 'sniptale.effect.v1',
    kind: 'targetEffect',
    source,
    assets: [],
    retainedByteLength: new TextEncoder().encode(source).byteLength,
  };
}
function undoRedo(store: ReturnType<typeof setup>['store']) {
  const current = store.getState();
  const undo = undoVideoEditorProjectHistory(
    current.projectHistory,
    current.project!,
    current.selection
  );
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  return { undo, redo };
}

it('publishes the complete prefix once through reconciliation', () => {
  const { store, asset, project } = completeComposition();
  const before = structuredClone(project);
  const listener = vi.fn();
  store.subscribe(listener);
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', project).status).toBe('placed');
  const next = store.getState().project!;
  expect(listener).toHaveBeenCalledTimes(1);
  expect(project).toEqual(before);
  expect(next.clips[0]!.startTime).toBe(6);
  expect(next.duration).toBe(12);
  expect(next.motionRegions!.map((region) => region.startTime)).toEqual([7, 7]);
  expect(next.motionRegions![1]!.sourceBinding).toEqual(project.motionRegions![1]!.sourceBinding);
  expect(next.cursorTrack!.samples[0]).toEqual({ ...project.cursorTrack!.samples[0], time: 8 });
  expect(next.objectTracks![0]).toMatchObject({
    samples: [{ time: 8 }],
    correctionAnchors: [{ time: 9 }],
    analysis: { projectStartTime: 7, projectEndTime: 10 },
  });
  expect(next.textDocuments![1]).toEqual(project.textDocuments![1]);
  for (const entry of next.textDocuments!) {
    expect(
      projectVideoProjectTextFragment(next, entry, entry.document.fragments[0]!).ranges
    ).toEqual([{ start: 7, end: 9 }]);
  }
  expect(next.textDocuments![0]!.document.fragments[0]).toMatchObject({
    timingRevision: 5,
    revision: 2,
    words: [
      { start: 7, end: 8 },
      { start: 8, end: 9 },
    ],
  });
  const notes = next.commentDocuments!;
  expect(
    projectVideoProjectCommentAnchor(next, notes[0]!, notes[0]!.annotations[0]!.anchor)
  ).toEqual([{ clipId: null, start: 7, end: 9 }]);
  expect(
    projectVideoProjectCommentAnchor(next, notes[1]!, notes[1]!.annotations[0]!.anchor)
  ).toEqual([{ clipId: project.clips[0]!.id, start: 8, end: 8 }]);
  expect(resolveVideoProjectActionOccurrences(next).map((item) => item.time)).toEqual([8, 8]);
  expect(next.cursorFocusPath!.segments[0]).toMatchObject({
    start: 7,
    end: 9,
    keys: [{ time: 8 }],
  });
  expect(next.cursorFocusPath!.segments[1]).toEqual(project.cursorFocusPath!.segments[1]);
  expect(next.assets).toEqual(project.assets);
  expect(store.getState().selection).toEqual({ kind: 'clip', clipId: next.clips[1]!.id });
  expect(isHydratableVideoProject(next)).toBe(true);
});

it('appends without changing any existing clock', () => {
  const { store, asset, project } = completeComposition();
  expect(store.getState().placeBookendMaterial(asset.id, 'outro', project).status).toBe('placed');
  const next = store.getState().project!;
  expect(next.clips[1]!.startTime).toBe(6);
  expect(next.clips[0]).toEqual(project.clips[0]);
  for (const field of [
    'textDocuments',
    'commentDocuments',
    'cursorTrack',
    'objectTracks',
    'actionEvents',
    'motionRegions',
    'cursorFocusPath',
  ] as const)
    expect(next[field]).toEqual(project[field]);
});

it('one command is one undo step and redo restores the complete graph', () => {
  const { store, asset, project } = completeComposition();
  const count = store.getState().projectHistory.past.length;
  store.getState().placeBookendMaterial(asset.id, 'intro', project);
  const accepted = store.getState().project!;
  expect(store.getState().projectHistory.past).toHaveLength(count + 1);
  const { undo, redo } = undoRedo(store);
  expect(undo.project).toEqual({ ...project, updatedAt: undo.project.updatedAt });
  expect(redo.project).toEqual({ ...accepted, updatedAt: redo.project.updatedAt });
  expect(redo.selection).toEqual(store.getState().selection);
});

it.each(['intro', 'outro'] as const)(
  'retains owner scoped effect coverage and phase when bookends extend tracks: %s',
  (side) => {
    const { store, asset } = populated();
    const base = store.getState().project!;
    const other = createVideoProjectTrack('Other', 1, 'PRIMARY');
    const second = { ...base.clips[0]!, id: 'other-clip', trackId: other.id, duration: 2 };
    const snapshot = targetSnapshot();
    const project: VideoProject = {
      ...base,
      tracks: [...base.tracks, other],
      clips: [...base.clips, second],
      effectSnapshots: [snapshot],
      effectInstances: [base.tracks[0]!.id, other.id].map((trackId, index) => ({
        id: `fx-${index}`,
        snapshotId: snapshot.id,
        kind: 'targetEffect',
        target: { kind: 'track', trackId },
        startTime: 0,
        duration: index === 0 ? 6 : 2,
        playbackRate: index === 0 ? 0.5 : 1.5,
        sourceStart: 0,
        rangeMode: 'owner',
        enabled: true,
        controls: {},
      })),
    };
    project.effectInstances!.push({
      ...project.effectInstances![0]!,
      id: 'group-fx',
      target: { kind: 'video-group' },
    });
    expect(isHydratableVideoProject(project)).toBe(true);
    store.setState({ project });
    expect(store.getState().placeBookendMaterial(asset.id, side, project).status).toBe('placed');
    const next = store.getState().project!;
    expect(next.effectInstances![0]).toEqual({
      ...project.effectInstances![0],
      startTime: side === 'intro' ? 6 : 0,
      rangeMode: 'interval',
    });
    expect(next.effectInstances![1]).toEqual({
      ...project.effectInstances![1],
      startTime: side === 'intro' ? 6 : 0,
      rangeMode: side === 'intro' ? 'interval' : 'owner',
    });
    expect(next.effectInstances![2]).toEqual({
      ...project.effectInstances![2],
      startTime: side === 'intro' ? 6 : 0,
      rangeMode: 'interval',
    });
    const { undo, redo } = undoRedo(store);
    expect(undo.project.effectInstances).toEqual(project.effectInstances);
    expect(redo.project.effectInstances).toEqual(next.effectInstances);
  }
);

it('refuses stale roots and accepts a fresh retry', () => {
  const { store, asset, project } = populated();
  const stale = store.getState().project!;
  store.getState().renameProject('Another edit');
  const before = store.getState();
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', stale)).toEqual({
    status: 'rejected',
    reason: 'stale-project',
  });
  expect(store.getState()).toBe(before);
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', before.project!).status).toBe(
    'placed'
  );
  expect(project.clips).toHaveLength(0);
});

it('refuses replaced identities despite equal project ids', () => {
  const { store, asset } = populated();
  const stale = store.getState().project!;
  store.setState({ project: null });
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', stale)).toEqual({
    status: 'rejected',
    reason: 'no-project',
  });
  store.setState({ project: structuredClone(stale) });
  const before = store.getState();
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', stale)).toEqual({
    status: 'rejected',
    reason: 'stale-project',
  });
  expect(store.getState()).toBe(before);
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', before.project!).status).toBe(
    'placed'
  );
});

it('preserves a foreign history lease on refusal and accepts after release', () => {
  const { store, asset } = populated();
  const project = store.getState().project!;
  store.setState({
    projectHistory: beginVideoEditorProjectHistoryTransaction(
      store.getState().projectHistory,
      project
    ),
  });
  const before = store.getState();
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', project)).toEqual({
    status: 'rejected',
    reason: 'history-busy',
  });
  expect(store.getState()).toBe(before);
  store.setState({
    projectHistory: endVideoEditorProjectHistoryTransaction(before.projectHistory, project),
  });
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', project).status).toBe('placed');
});

it.each(['clip', 'camera', 'actions'] as const)(
  'refuses invalid or locked placement without changing graph selection or history: %s',
  (lock) => {
    const { store, asset, project } = completeComposition();
    if (lock === 'clip') project.tracks[0]!.locked = true;
    else
      project.utilityLanes = {
        actions: { visible: true, locked: lock === 'actions' },
        camera: { visible: true, locked: lock === 'camera' },
      };
    const before = store.getState();
    expect(store.getState().placeBookendMaterial(asset.id, 'intro', project)).toEqual({
      status: 'rejected',
      reason: 'locked-track',
    });
    expect(store.getState()).toBe(before);
  }
);

it.each(['missing', 'audio', 'duration', 'overflow'] as const)(
  'refuses invalid or locked placement without changing graph selection or history: %s',
  (failure) => {
    const { store, asset, project } = completeComposition();
    if (failure === 'audio') asset.type = 'AUDIO';
    if (failure === 'duration') asset.metadata.duration = NaN;
    if (failure === 'overflow') project.textDocuments![0]!.document.fragments[0]!.end = 86_399;
    const before = store.getState();
    expect(
      store
        .getState()
        .placeBookendMaterial(failure === 'missing' ? 'missing' : asset.id, 'intro', project).status
    ).toBe('rejected');
    expect(store.getState()).toBe(before);
  }
);

it('refuses an unavailable history snapshot without publishing and accepts a retry', () => {
  const { store, asset } = populated();
  const before = store.getState();
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation(() => {
    throw new Error('Snapshot unavailable');
  });
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', before.project!)).toEqual({
    status: 'rejected',
    reason: 'history-unavailable',
  });
  expect(store.getState()).toBe(before);
  clone.mockRestore();
  expect(store.getState().placeBookendMaterial(asset.id, 'intro', before.project!).status).toBe(
    'placed'
  );
});

it.each(['IMAGE', 'VIDEO', 'RECORDING'] as const)(
  'round trips ordinary inserted materials and translated retained clocks: %s',
  (type) => {
    const { store, asset, project } = completeComposition();
    asset.type = type;
    asset.metadata.hasAudio = type !== 'IMAGE';
    const result = store.getState().placeBookendMaterial(asset.id, 'intro', project);
    expect(result.status).toBe('placed');
    const next = store.getState().project!;
    const reopened: unknown = JSON.parse(JSON.stringify(next));
    expect(isHydratableVideoProject(reopened)).toBe(true);
    expect(reopened).toEqual(next);
    expect(next.clips.slice(1).map((clip) => clip.startTime)).toEqual(
      type === 'IMAGE' ? [0] : [0, 0]
    );
    if (type !== 'IMAGE') expect(next.clips[1]!.groupId).toBe(next.clips[2]!.groupId);
  }
);

it('inserts recording sidecars as linked ordinary clips using the primary span', () => {
  const { store, asset } = populated();
  const project = store.getState().project!;
  asset.type = 'RECORDING';
  asset.recordingPart = { recordingId: 'recording', role: 'primary' };
  const camera = {
    ...asset,
    id: 'camera-material',
    name: 'Camera',
    recordingPart: { recordingId: 'recording', role: 'camera' as const },
    source: {
      kind: 'project-asset' as const,
      projectAssetId: 'camera',
      originRecordingId: 'recording',
    },
    metadata: { ...asset.metadata, duration: 4, hasAudio: false },
  };
  project.assets.push(camera);
  expect(isHydratableVideoProject(project)).toBe(true);
  const result = store.getState().placeBookendMaterial(asset.id, 'intro', project);
  expect(result.status).toBe('placed');
  const next = store.getState().project!;
  const added = next.clips.slice(project.clips.length);
  expect(next.clips[0]!.startTime).toBe(6);
  expect(added.map((clip) => clip.duration)).toEqual([6, 4]);
  expect(new Set(added.map((clip) => clip.groupId)).size).toBe(1);
  expect(added[0]!.groupId).not.toBeNull();
  expect(next.tracks.find((track) => track.id === added[1]!.trackId)?.role).toBe('CAMERA');
  expect(isHydratableVideoProject(next)).toBe(true);
});

it('appends with unaffected utility locks but refuses a locked receiving track', () => {
  const { store, asset, project } = completeComposition();
  project.utilityLanes = {
    actions: { visible: true, locked: true },
    camera: { visible: true, locked: true },
  };
  expect(store.getState().placeBookendMaterial(asset.id, 'outro', project).status).toBe('placed');
  const appended = store.getState().project!;
  expect(appended.actionEvents).toEqual(project.actionEvents);
  expect(appended.motionRegions).toEqual(project.motionRegions);
  const locked = {
    ...appended,
    tracks: appended.tracks.map((track) => ({ ...track, locked: true })),
  };
  store.setState({ project: locked });
  const before = store.getState();
  expect(store.getState().placeBookendMaterial(asset.id, 'outro', locked)).toEqual({
    status: 'rejected',
    reason: 'locked-track',
  });
  expect(store.getState()).toBe(before);
});

it.each([
  ['intro', true],
  ['outro', true],
  ['intro', false],
  ['outro', false],
] as const)(
  'applies %s media fade enabled=%s atomically and retains independent recipes',
  (side, enabled) => {
    const { store, asset } = populated();
    const before = store.getState().project!;
    const presets = createVideoProjectBookendPresets();
    presets[side] = {
      mode: 'video',
      video: {
        ...createBookendVideoPresentation(6),
        assetId: asset.id,
        trim: { start: 1, end: 2 },
      },
      edgeControl: {
        mode: 'none',
        plain: { enabled: true, duration: 0.2, color: '#112233ff', audioFade: false },
        media: { enabled, duration: 2, color: '#223344ff', audioFade: true },
      },
    };
    const project: VideoProject = {
      ...before,
      version: 41,
      bookendPresets: presets,
      sceneEdges: {
        intro: { enabled: false, duration: 0.7 },
        outro: { enabled: false, duration: 0.8 },
      },
    };
    store.setState({ project });
    const history = store.getState().projectHistory;
    expect(store.getState().placeBookendMaterial(asset.id, side, project).status).toBe('placed');
    const after = store.getState();
    expect(after.project!.sceneEdges![side]).toEqual({
      enabled,
      duration: enabled ? 1 : 2,
      color: '#223344ff',
      audioFade: true,
    });
    const other = side === 'intro' ? 'outro' : 'intro';
    expect(after.project!.sceneEdges![other]).toEqual(project.sceneEdges![other]);
    expect(after.project!.bookendPresets).toEqual(presets);
    expect(after.projectHistory.past).toHaveLength(history.past.length + 1);
    const undo = undoVideoEditorProjectHistory(
      after.projectHistory,
      after.project!,
      after.selection
    );
    if (undo?.status !== 'applied') throw new Error('Expected undo');
    expect(undo.project.sceneEdges).toEqual(project.sceneEdges);
    expect(undo.project.clips).toEqual(project.clips);
    const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
    if (redo?.status !== 'applied') throw new Error('Expected redo');
    expect(redo.project.sceneEdges).toEqual(after.project!.sceneEdges);
    expect(redo.project.clips).toEqual(after.project!.clips);
  }
);
