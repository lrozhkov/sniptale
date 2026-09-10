import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createVideoClip } from '../../features/video/project/timeline/project-meta.test.helpers';
import {
  VideoExportScope,
  VideoExportFormat,
  VideoExportQualityPreset,
} from '../../features/video/project/types';
import { resolveProjectRenderScope } from './scope';
it('keeps applicable global and track FX while excluding unrelated track chains in selected-clip exports', () => {
  const project = createEmptyVideoProject('Selected effects');
  const track = project.tracks[0]!;
  project.tracks.push({ ...track, id: 'other' });
  project.clips = [
    createVideoClip({ id: 'one', trackId: track.id }),
    createVideoClip({ id: 'two', trackId: 'other' }),
  ];
  project.effectInstances = [
    {
      id: 'global',
      kind: 'targetEffect',
      playbackRate: 1,
      snapshotId: 'global',
      controls: {},
      enabled: true,
      startTime: 0,
      duration: 1,
      target: { kind: 'video-group' },
    },
    {
      id: 'track',
      kind: 'targetEffect',
      playbackRate: 1,
      snapshotId: 'track',
      controls: {},
      enabled: true,
      startTime: 0,
      duration: 1,
      target: { kind: 'track', trackId: track.id },
    },
    {
      id: 'other',
      kind: 'targetEffect',
      playbackRate: 1,
      snapshotId: 'other',
      controls: {},
      enabled: true,
      startTime: 0,
      duration: 1,
      target: { kind: 'track', trackId: 'other' },
    },
  ];
  const scoped = resolveProjectRenderScope(project, {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE',
    mp4VideoCodec: 'AVC',
    fps: 30,
    height: 1080,
    quality: VideoExportQualityPreset.MEDIUM,
    width: 1920,
    scope: VideoExportScope.SELECTED_CLIP,
    selectedClipIds: ['one'],
  });
  expect(scoped.clips.map((c) => c.id)).toEqual(['one']);
  expect(scoped.effectInstances!.map((e) => e.id)).toEqual(['global', 'track']);
  expect(project.effectInstances).toHaveLength(3);
});
