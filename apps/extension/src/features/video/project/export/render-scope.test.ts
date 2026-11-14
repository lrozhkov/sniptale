import { createProject } from '../timeline/project-meta.test.helpers';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isExportReadyVideoProject } from '../validation/root';
import { expect, it } from 'vitest';
import { createVideoClip } from '../timeline/project-meta.test.helpers';
import { VideoExportScope, VideoExportFormat, VideoExportQualityPreset } from '../types';
import { resolveProjectRenderScope } from './render-scope';

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
