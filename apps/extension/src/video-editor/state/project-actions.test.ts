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
          duration: 0,
          id: 'manual-click',
          kind: 'CLICK',
          label: 'Manual click',
          point: null,
          preset: 'CLICK_RIPPLE',
          time: 1,
          timeBasis: 'project',
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
      expect.objectContaining({ id: 'manual-click', time: 1, timeBasis: 'project' }),
    ]);
    expect(store.getState().project?.actionEvents[0]).not.toHaveProperty('sourceAnchor');
    expect(store.getState().project?.cursorTrack?.samples).toEqual([
      expect.objectContaining({ id: 'manual-cursor', time: 1, timeBasis: 'project' }),
    ]);
    expect(store.getState().project?.cursorTrack?.samples[0]).not.toHaveProperty('sourceAnchor');
  });

  it('resets and reopens telemetry lane visibility from recording telemetry lifecycle', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Timeline');
    project.baseRecordingId = 'rec-1';
    const telemetry = createRecordingTelemetryEntry('rec-1');

    store.getState().setProject(project, 'recording-1');
    store.getState().setRecordingTelemetry(telemetry);
    expect(store.getState().telemetryLaneVisible).toBe(true);

    store.getState().toggleTelemetryLaneVisibility();
    expect(store.getState().telemetryLaneVisible).toBe(false);

    store.getState().setRecordingTelemetry({ ...telemetry });
    expect(store.getState().telemetryLaneVisible).toBe(false);

    store.getState().setRecordingTelemetry(createRecordingTelemetryEntry('rec-2'));
    expect(store.getState().recordingTelemetry).toBeNull();
    expect(store.getState().telemetryLaneVisible).toBe(false);

    store.getState().setRecordingTelemetry(null);
    expect(store.getState().telemetryLaneVisible).toBe(false);
  });

  it('hydrates subtitle-first projects with one presented selection authority', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Subtitle-first');
    project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.OVERLAY));
    const subtitleTrack = createVideoProjectTrack('Subtitles', 4, VideoTrackKind.SUBTITLE);
    const overlayTrack = project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)!;
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
