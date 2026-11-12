import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createGlTransitionSelection } from '../transition/gl-catalog';
import { createVideoProjectTrack } from '../factories/creation';
import { expect, it } from 'vitest';
import {
  VideoTrackKind,
  VideoProjectClipType,
  VideoTransitionEasing,
  type VideoProject,
} from '../types';
import { createEffectHostClip } from '../factories/overlay-clip';
import { resolveProjectRenderScope } from './render-scope';
import {
  createScopeClip,
  createScopeProject,
  createScopeSettings,
} from './render-scope.test-support';

function addAnnotation(project: VideoProject, id: string, name: string) {
  const source = readFileSync(
    `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
    'utf8'
  );
  const parsed = parseAnimationTemplateSource(source);
  if (!parsed.ok) throw new Error('Expected valid animation.');
  const hash = createHash('sha256').update(source).digest('hex');
  const track = createVideoProjectTrack('Annotation', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(track);
  const host = createEffectHostClip({
    duration: 1,
    effectInstanceId: id,
    name: id,
    projectWidth: project.width,
    projectHeight: project.height,
    startTime: 0,
    trackId: track.id,
  });
  host.id = `${id}-host`;
  project.clips.push(host);
  project.effectSnapshots!.push({
    assets: [],
    documentId: parsed.template.id,
    id: `effect:${hash}`,
    kind: 'standalone',
    retainedByteLength: Buffer.byteLength(source),
    schemaVersion: 'sniptale.animation.v1',
    sha256: hash,
    source,
  });
  project.effectInstances!.push({
    controls: {},
    duration: 1,
    enabled: true,
    id,
    kind: 'standalone',
    playbackRate: 3,
    snapshotId: `effect:${hash}`,
    startTime: 0,
    target: { kind: 'scene' },
  });
  return { host, snapshotId: `effect:${hash}` };
}
function createTransition(id: string, leadingClipId: string, trailingClipId: string) {
  return {
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    id,
    kind: 'gl' as const,
    selection: createGlTransitionSelection('Fade')!,
    leadingClipId,
    trailingClipId,
  };
}
it('projects ordinary GL boundaries and selected annotation hosts as a closed graph', () => {
  const project = createScopeProject(
    ['clip-1', 'clip-2', 'clip-3'].map((id) => createScopeClip(id, VideoProjectClipType.VIDEO))
  );
  project.transitions = [
    createTransition('transition-kept', 'clip-1', 'clip-2'),
    createTransition('transition-dropped', 'clip-2', 'clip-3'),
  ];
  const kept = addAnnotation(project, 'kept', 'title');
  addAnnotation(project, 'dropped', 'frame');
  const before = structuredClone(project);
  const scoped = resolveProjectRenderScope(
    project,
    createScopeSettings({
      scope: 'selected-clip',
      selectedClipIds: ['clip-1', 'clip-2', kept.host.id],
    })
  );
  expect(scoped.clips.map((clip) => clip.id)).toEqual(['clip-1', 'clip-2', kept.host.id]);
  expect(scoped.transitions?.map((entry) => entry.id)).toEqual(['transition-kept']);
  expect(scoped.effectInstances?.map((entry) => entry.id)).toEqual(['kept']);
  expect(scoped.effectSnapshots?.map((entry) => entry.id)).toEqual([kept.snapshotId]);
  expect(project).toEqual(before);
});
it('retains a standalone annotation only with its selected ordinary host clip', () => {
  const project = createScopeProject([createScopeClip('clip-1', VideoProjectClipType.VIDEO)]),
    { host, snapshotId } = addAnnotation(project, 'standalone', 'title');
  const withoutHost = resolveProjectRenderScope(
    project,
    createScopeSettings({ scope: 'selected-clip', selectedClipIds: ['clip-1'] })
  );
  expect(withoutHost.effectInstances).toEqual([]);
  expect(withoutHost.effectSnapshots).toEqual([]);
  const withHost = resolveProjectRenderScope(
    project,
    createScopeSettings({ scope: 'selected-clip', selectedClipIds: [host.id] })
  );
  expect(withHost.effectInstances?.map((entry) => entry.id)).toEqual(['standalone']);
  expect(withHost.effectSnapshots?.map((entry) => entry.id)).toEqual([snapshotId]);
});

it('validates selected IDs, keeps complete scopes intact and includes subtitles only when requested', () => {
  const project = createScopeProject([
    createScopeClip('video', VideoProjectClipType.VIDEO),
    createScopeClip('subtitle', VideoProjectClipType.SUBTITLE),
  ]);
  expect(resolveProjectRenderScope(project, createScopeSettings({}))).toBe(project);
  for (const selectedClipIds of [[], ['missing']])
    expect(() =>
      resolveProjectRenderScope(
        project,
        createScopeSettings({ scope: 'selected-clip', selectedClipIds })
      )
    ).toThrow();
  expect(
    resolveProjectRenderScope(
      project,
      createScopeSettings({
        scope: 'selected-clip',
        selectedClipIds: ['video'],
        burnInSubtitles: true,
      })
    )
  ).toBe(project);
  expect(
    resolveProjectRenderScope(
      project,
      createScopeSettings({
        scope: 'selected-clip',
        selectedClipIds: ['video'],
        burnInSubtitles: false,
      })
    ).clips.map((c) => c.id)
  ).toEqual(['video']);
});
