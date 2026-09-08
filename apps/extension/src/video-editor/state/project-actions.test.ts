import { resolveVideoProjectActionOccurrences } from '../../features/video/project/action-occurrences';
import { describe, expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../features/video/project/factories/creation';
import {
  createSubtitleClip,
  createTextClip,
} from '../../features/video/project/factories/overlay-clip';
import { VideoTrackKind } from '../../features/video/project/types';
import { createVideoProjectCursorTrack } from '../../features/video/project/defaults';
import {
  createProject,
  createVideoClip,
} from '../../features/video/project/timeline/project-meta.test.helpers.ts';
import { createVideoEditorProjectActions } from '../project/state/actions';
import type { VideoEditorState } from './types';
import { create } from 'zustand';
import { createVideoEditorTimelineState } from './root-state';
import { createExportStateActions } from './export-state';
import { createVideoEditorProjectHistoryActions } from './history-actions';

function createTimelineStore() {
  return create<VideoEditorState>()((set, get) => ({
    ...createVideoEditorTimelineState(set),
    ...createVideoEditorProjectActions(set, get),
    ...createVideoEditorProjectHistoryActions(set, get),
    ...createExportStateActions(set),
  }));
}

describe('video editor timeline project state', () => {
  it('keeps another recording instance bound through move, speed, Undo and project replacement', () => {
    const project = createProject([
      createVideoClip(),
      createVideoClip({
        id: 'second',
        sourceInstanceId: 'second-source',
        assetId: 'second-asset',
        startTime: 10,
      }),
      createVideoClip({
        id: 'repeat',
        sourceInstanceId: 'repeat-source',
        assetId: 'second-asset',
        startTime: 22,
      }),
    ]);
    project.duration = 30;
    project.assets.push({
      ...project.assets[0]!,
      id: 'second-asset',
      source: {
        kind: 'project-asset',
        projectAssetId: 'copied',
        originRecordingId: 'second-recording',
      },
    });
    const anchor = {
      kind: 'recording-source' as const,
      recordingId: 'second-recording',
      sourceInstanceId: 'second-source',
      sourceEventId: 'raw',
      sourceTime: 2,
    };
    project.actionEvents = [
      {
        id: 'second-click',
        kind: 'CLICK',
        point: { x: 0.1, y: 0.1 },
        label: 'Second click',
        data: {},
        capturedDuration: 0.4,
        anchor,
      },
    ];
    const store = createTimelineStore();
    store.getState().setProject(project);
    expect(store.getState().project?.actionEvents[0]?.anchor).toEqual(anchor);
    store.getState().moveClip('second', 12);
    expect(store.getState().project?.actionEvents[0]?.anchor).toEqual(anchor);
    expect(resolveVideoProjectActionOccurrences(store.getState().project!)[0]?.time).toBe(14);
    store.getState().updateClipPlaybackRate('second', 2);
    expect(store.getState().project?.actionEvents[0]?.anchor).toEqual(anchor);
    expect(resolveVideoProjectActionOccurrences(store.getState().project!)[0]?.time).toBe(13);
    store.getState().undoProject();
    expect(resolveVideoProjectActionOccurrences(store.getState().project!)[0]?.time).toBe(14);
    store.getState().undoProject();
    expect(resolveVideoProjectActionOccurrences(store.getState().project!)[0]?.time).toBe(12);
    store.getState().setProject(structuredClone(store.getState().project!));
    expect(store.getState().project?.actionEvents[0]?.anchor).toEqual(anchor);
    expect(resolveVideoProjectActionOccurrences(store.getState().project!)[0]?.time).toBe(12);
  });
  it('admits material-source sidecars once and rejects unrelated recordings', () => {
    const store = createTimelineStore();
    store.getState().setProject(createProject([createVideoClip()]));
    const first = createRecordingTelemetryEntry('rec-asset-video');
    const second = createRecordingTelemetryEntry('rec-asset-audio');
    store
      .getState()
      .setRecordingTelemetry([first, second, first, createRecordingTelemetryEntry('foreign')]);
    expect(store.getState().recordingTelemetry).toEqual([first, second]);
    store.getState().setRecordingTelemetry([second, first]);
    store.getState().setProject(createEmptyVideoProject('Other'));
    expect(store.getState().recordingTelemetry).toEqual([]);
    store.getState().setRecordingTelemetry([first]);
    expect(store.getState().recordingTelemetry).toEqual([]);
  });
  it('hydrates loaded projects and keeps project updates on the canonical path', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Timeline');

    store.getState().updateProject((currentProject) => currentProject);
    expect(store.getState().project).toBeNull();
    store.getState().setProject(project, 'recording-1');
    const loadedProject = store.getState().project;
    store.getState().updateProject((currentProject) => currentProject);
    expect(store.getState().project).toBe(loadedProject);
    store.getState().updateProject((currentProject) => ({
      ...currentProject,
      name: 'Renamed',
    }));
    store.getState().setReady(true);
    store.getState().setError('timeline-error');
    store.getState().setSaveState('saved');

    expect(store.getState()).toMatchObject({
      error: 'timeline-error',
      isReady: true,
      project: expect.objectContaining({ name: 'Renamed' }),
      recordingId: 'recording-1',
      saveState: 'saved',
    });
  });

  it('keeps manually added project-time interactions independent across source clip edits', () => {
    const store = createTimelineStore();
    const project = createProject([createVideoClip()]);
    project.baseRecordingId = 'rec-asset-video';
    project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
    store.getState().setProject(project, 'rec-asset-video');

    store.getState().updateProject((currentProject) => ({
      ...currentProject,
      actionEvents: [
        {
          data: {},
          capturedDuration: 0,
          id: 'manual-click',
          kind: 'CLICK',
          label: 'Manual click',
          point: null,
          anchor: { kind: 'project', time: 1 },
        },
      ],
      cursorTrack: {
        ...createVideoProjectCursorTrack(),
        samples: [
          {
            id: 'manual-cursor',
            time: 1,
            timeBasis: 'project',
            visible: true,
            x: 10,
            y: 20,
          },
        ],
      },
    }));
    const persistedProject = JSON.parse(JSON.stringify(store.getState().project)) as typeof project;
    store.getState().setProject(persistedProject, 'rec-asset-video');
    store.getState().updateProject((currentProject) => ({
      ...currentProject,
      clips: currentProject.clips.map((clip) => ({ ...clip, startTime: 3 })),
    }));
    store.getState().updateProject((currentProject) => ({
      ...currentProject,
      clips: [],
    }));

    expect(store.getState().project?.actionEvents).toEqual([
      expect.objectContaining({ id: 'manual-click', anchor: { kind: 'project', time: 1 } }),
    ]);
    expect(store.getState().project?.actionEvents[0]).not.toHaveProperty('sourceAnchor');
    expect(store.getState().project?.cursorTrack?.samples).toEqual([
      expect.objectContaining({ id: 'manual-cursor', time: 1, timeBasis: 'project' }),
    ]);
    expect(store.getState().project?.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  });

  it('admits only current recording sources without owning history visibility', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Timeline');
    project.baseRecordingId = 'rec-1';
    const telemetry = createRecordingTelemetryEntry('rec-1');

    store.getState().setProject(project, 'recording-1');
    store.getState().setRecordingTelemetry([telemetry]);

    store.getState().setRecordingTelemetry([{ ...telemetry }]);

    store.getState().setRecordingTelemetry([createRecordingTelemetryEntry('rec-2')]);
    expect(store.getState().recordingTelemetry).toEqual([]);

    store.getState().setRecordingTelemetry([]);
  });

  it('hydrates subtitle-first projects with one presented selection authority', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Subtitle-first');
    project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
    const subtitleTrack = createVideoProjectTrack('Subtitles', 4, VideoTrackKind.SUBTITLE);
    const overlayTrack = project.tracks.find((track) => track.name === 'Overlay')!;
    const subtitleClip = createSubtitleClip(subtitleTrack.id, project.width, project.height, 0);
    const visibleClip = createTextClip(overlayTrack.id, project.width, project.height, 0);
    project.tracks.push(subtitleTrack);
    project.clips = [subtitleClip, visibleClip];

    store.getState().setProject(project);
    expect(store.getState()).toMatchObject({
      selectedTrackId: overlayTrack.id,
      selection: { kind: 'clip', clipId: visibleClip.id },
    });

    store.getState().deleteClip(visibleClip.id);
    expect(store.getState().project?.clips.map((clip) => clip.id)).toEqual([subtitleClip.id]);
  });
});

function createRecordingTelemetryEntry(recordingId: string): RecordingTelemetryEntry {
  return {
    recordingId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    viewport: null,
    captureMode: null,
    displaySurface: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
}

it('restores the deleted group selection with the project in one Undo', () => {
  const store = createTimelineStore();
  const project = createProject([
    createVideoClip(),
    createVideoClip({ id: 'second', startTime: 10 }),
  ]);
  store.getState().setProject(project);
  const ids = store.getState().project!.clips.map((clip) => clip.id);
  store.getState().selectClip(ids[0]!);
  store.getState().selectClip(ids[1]!, 'toggle');
  const selected = store.getState().selection;
  expect(selected.kind).toBe('clip-group');
  store.getState().deleteClip(ids);
  expect(store.getState().selection.kind).toBe('scene');
  store.getState().undoProject();
  expect(store.getState().project?.clips.map((clip) => clip.id)).toEqual(ids);
  expect(store.getState().selection).toEqual(selected);
  store.getState().redoProject();
  expect(store.getState().selection.kind).toBe('scene');
});

it('repairs group membership and anchor after selected clips disappear', () => {
  const store = createTimelineStore();
  store
    .getState()
    .setProject(
      createProject([
        createVideoClip({ id: 'a' }),
        createVideoClip({ id: 'b', startTime: 10 }),
        createVideoClip({ id: 'c', startTime: 20 }),
      ])
    );
  store.setState({
    selection: { kind: 'clip-group', clipIds: ['a', 'b', 'c'], anchorClipId: 'a' },
  });
  store.getState().deleteClip('a');
  expect(store.getState().selection).toEqual({
    kind: 'clip-group',
    clipIds: ['b', 'c'],
    anchorClipId: 'b',
  });
  store.getState().deleteClip('b');
  expect(store.getState().selection).toEqual({ kind: 'clip', clipId: 'c' });
});
