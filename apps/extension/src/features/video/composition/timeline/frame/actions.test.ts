import { describe, expect, it } from 'vitest';
import { resolveVideoCompositionActions } from './actions';
import { resolveVideoCompositionFrame } from './index';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../project/factories/creation';
import { createVideoClipFromAsset } from '../../../project/factories/clip';
import type { VideoProjectActionEvent } from '../../../project/types';

function manualEvent(): VideoProjectActionEvent {
  return {
    id: 'manual',
    anchor: { kind: 'project', time: 1 },
    kind: 'CLICK',
    label: 'Click',
    point: { x: 120, y: 160 },
    data: {},
  };
}

function capturedProject() {
  const project = createEmptyVideoProject('Source actions', 1000, 800);
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'recording', recordingId: 'source' },
    {
      width: 1000,
      height: 800,
      duration: 4,
      hasAudio: false,
      audioPeaks: null,
      mimeType: 'video/mp4',
      size: 10,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1000, 800, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'placement';
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 4;
  project.actionEvents = [
    {
      id: 'captured',
      kind: 'CLICK',
      data: {},
      label: 'Click',
      point: { x: 0.4, y: 0.6 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'source',
        sourceInstanceId: 'placement',
        sourceEventId: 'raw',
        sourceTime: 2.1,
      },
      presentation: { offset: -0.3, duration: 1 },
    },
  ];
  return { project, clip };
}

describe('composition action admission', () => {
  it('uses effective presentation duration, clipped progress and half-open end for a manual action', () => {
    const project = createEmptyVideoProject('Offset');
    project.duration = 3;
    project.actionEvents = [
      {
        ...manualEvent(),
        anchor: { kind: 'project', time: 0.2 },
        presentation: { offset: -0.5, duration: 1 },
      },
    ];
    expect(resolveVideoCompositionActions(project, 0)[0]?.progress).toBeCloseTo(0.3);
    expect(resolveVideoCompositionActions(project, 0.69)).toHaveLength(1);
    expect(resolveVideoCompositionActions(project, 0.7)).toEqual([]);
    expect(project.actionEvents[0]?.anchor).toEqual({ kind: 'project', time: 0.2 });
  });

  it('honors project defaults, event overrides and disabling independently of row visibility', () => {
    const project = createEmptyVideoProject('Presentation');
    project.duration = 3;
    project.actionEvents = [manualEvent()];
    project.utilityLanes = {
      actions: { visible: false, locked: false },
      camera: { visible: true, locked: false },
    };
    expect(resolveVideoCompositionActions(project, 1.2)[0]?.duration).toBe(0.7);
    project.actionEvents[0]!.presentation = { duration: 1.4 };
    expect(resolveVideoCompositionActions(project, 1.2)[0]?.duration).toBe(1.4);
    project.actionEvents[0]!.presentation = { enabled: false };
    expect(resolveVideoCompositionActions(project, 1.2)).toEqual([]);
  });

  it('routes captured accents only into their source layer and manual accents into the scene pass', () => {
    const { project, clip } = capturedProject();
    project.actionEvents.push({ ...manualEvent(), anchor: { kind: 'project', time: 2 } });
    const frame = resolveVideoCompositionFrame(project, 2.2);
    expect(frame.actions.map((action) => action.event.id)).toEqual(['manual']);
    const layer = frame.visualLayers.find((item) => item.clipId === clip.id);
    expect(layer?.kind).toBe('video');
    if (layer?.kind !== 'video') throw new Error('Expected video layer');
    expect(layer.actions?.map((action) => action.event.id)).toEqual(['captured']);
    expect(layer.actions?.[0]?.point).toEqual({ x: 0.4, y: 0.6 });
  });

  it('keeps progress across a no-op split, including pre-offset pixels in the preceding fragment', () => {
    const { project, clip } = capturedProject();
    const before = resolveVideoCompositionActions(project, 1.9)[0]!;
    project.clips = [
      { ...clip, duration: 2, sourceDuration: 2 },
      { ...clip, id: 'right', startTime: 2, duration: 2, sourceStart: 2, sourceDuration: 2 },
    ];
    const prefix = resolveVideoCompositionActions(project, 1.9)[0]!;
    expect(prefix.progress).toBeCloseTo(before.progress);
    expect(prefix.clipId).toBe(clip.id);
    expect(prefix.occurrence.clipId).toBe('right');
    expect(resolveVideoCompositionActions(project, 2)[0]?.clipId).toBe('right');
    expect(resolveVideoCompositionActions(project, 2)[0]?.progress).toBeCloseTo(0.2);
    expect(project.actionEvents).toHaveLength(1);
    expect(project.actionEvents[0]?.anchor).toMatchObject({ sourceTime: 2.1 });
  });

  it('never paints before source admission or across a gap', () => {
    const { project, clip } = capturedProject();
    project.clips = [
      { ...clip, duration: 2, sourceDuration: 2 },
      { ...clip, id: 'right', startTime: 3, duration: 2, sourceStart: 2, sourceDuration: 2 },
    ];
    project.duration = 5;
    expect(resolveVideoCompositionActions(project, 2.9)).toEqual([]);
    expect(resolveVideoCompositionActions(project, 3)[0]?.progress).toBeCloseTo(0.2);
    project.clips = [{ ...clip, duration: 2, sourceDuration: 2 }];
    expect(resolveVideoCompositionActions(project, 1.9)).toEqual([]);
  });
});
