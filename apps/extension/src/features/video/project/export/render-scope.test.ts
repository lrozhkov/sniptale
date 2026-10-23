import { createProject } from '../timeline/project-meta.test.helpers';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isExportReadyVideoProject } from '../validation/root';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoClip } from '../timeline/project-meta.test.helpers';
import { VideoExportScope, VideoExportFormat, VideoExportQualityPreset } from '../types';
import { resolveProjectRenderScope } from './render-scope';
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

it('omits whole-composition joins only from a disposable selected-clip subset and preserves the accepted root', () => {
  const project = applyVideoProjectMutationPatch(
    createProject([
      createVideoClip({ id: 'intro', trackId: 'track-video', duration: 1, sourceDuration: 1 }),
      createVideoClip({
        id: 'main',
        trackId: 'track-video',
        startTime: 1,
        duration: 2,
        sourceDuration: 2,
      }),
    ]),
    {
      compositionJoins: [
        {
          id: 'join',
          clipId: 'intro',
          edge: 'end',
          transition: { type: 'dissolve', before: 0.2, after: 0.2 },
        },
      ],
    }
  );
  const before = structuredClone(project);
  const settings = {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
    width: 1280,
    scope: VideoExportScope.SELECTED_CLIP,
  };
  for (const selectedClipIds of [['main'], ['intro']]) {
    const subset = resolveProjectRenderScope(project, { ...settings, selectedClipIds });
    expect(subset.compositionJoins).toEqual([]);
    expect(isExportReadyVideoProject(subset)).toBe(true);
  }
  expect(
    resolveProjectRenderScope(project, { ...settings, selectedClipIds: ['main', 'intro'] })
  ).toBe(project);
  expect(resolveProjectRenderScope(project, { ...settings, scope: VideoExportScope.PROJECT })).toBe(
    project
  );
  expect(
    resolveProjectRenderScope(project, { ...settings, scope: VideoExportScope.SELECTED_RANGE })
  ).toBe(project);
  expect(project).toEqual(before);
});
