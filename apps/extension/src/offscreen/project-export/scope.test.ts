import { expect, it } from 'vitest';
import { resolveProjectRenderScope } from './scope';
import { VideoProjectClipType } from '../../features/video/project/types';
import {
  createScopeClip as createClip,
  createScopeProject as createProject,
  createScopeSettings as createSettings,
} from './scope.test-support';

it('keeps only selected clip ids for selected-clip exports', () => {
  const project = createProject([
    createClip('clip-1', VideoProjectClipType.VIDEO),
    createClip('clip-2', VideoProjectClipType.AUDIO),
    createClip('subtitle-1', VideoProjectClipType.SUBTITLE),
  ]);

  expect(
    resolveProjectRenderScope(
      project,
      createSettings({
        burnInSubtitles: false,
        scope: 'selected-clip',
        selectedClipIds: ['clip-1'],
      })
    )
  ).toEqual({
    ...project,
    clips: [project.clips[0]],
  });
});

it('keeps subtitle clips in the render scope when subtitle burn-in is enabled', () => {
  const project = createProject([
    createClip('clip-1', VideoProjectClipType.VIDEO),
    createClip('clip-2', VideoProjectClipType.AUDIO),
    createClip('subtitle-1', VideoProjectClipType.SUBTITLE),
  ]);

  expect(
    resolveProjectRenderScope(
      project,
      createSettings({
        burnInSubtitles: true,
        scope: 'selected-clip',
        selectedClipIds: ['clip-1'],
      })
    )
  ).toEqual({
    ...project,
    clips: [project.clips[0], project.clips[2]],
  });
});

it('returns the original project outside selected-clip scope', () => {
  const project = createProject([createClip('clip-1', VideoProjectClipType.VIDEO)]);

  expect(
    resolveProjectRenderScope(
      project,
      createSettings({
        burnInSubtitles: true,
        scope: 'project',
        selectedClipIds: ['clip-1'],
      })
    )
  ).toBe(project);
});

it('returns the original project when the selected scope already covers its complete graph', () => {
  const project = createProject([
    createClip('clip-1', VideoProjectClipType.VIDEO),
    createClip('clip-2', VideoProjectClipType.AUDIO),
  ]);

  expect(
    resolveProjectRenderScope(
      project,
      createSettings({
        scope: 'selected-clip',
        selectedClipIds: ['clip-1', 'clip-2'],
      })
    )
  ).toBe(project);
});

it('rejects selected-clip exports with empty or stale clip ids', () => {
  const project = createProject([
    createClip('clip-1', VideoProjectClipType.VIDEO),
    createClip('clip-2', VideoProjectClipType.AUDIO),
  ]);

  expect(() =>
    resolveProjectRenderScope(
      project,
      createSettings({
        scope: 'selected-clip',
        selectedClipIds: [],
      })
    )
  ).toThrow('Invalid video project export settings');
  expect(() =>
    resolveProjectRenderScope(
      project,
      createSettings({
        scope: 'selected-clip',
        selectedClipIds: ['missing'],
      })
    )
  ).toThrow('Invalid video project export settings');
  expect(() =>
    resolveProjectRenderScope(
      project,
      createSettings({
        scope: 'selected-clip',
        selectedClipIds: ['clip-1', 'missing'],
      })
    )
  ).toThrow('Invalid video project export settings');
});
