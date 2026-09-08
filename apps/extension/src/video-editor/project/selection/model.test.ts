import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import {
  createSubtitleClip,
  createTextClip,
} from '../../../features/video/project/factories/overlay-clip';
import { VideoTrackKind } from '../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { resolveInitialVideoEditorSelection } from './model';

it('skips a persisted subtitle-first clip when choosing the initial selection', () => {
  const project = createEmptyVideoProject('Legacy subtitles');
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
  const subtitleTrack = createVideoProjectTrack('Subtitles', 4, VideoTrackKind.SUBTITLE);
  const overlayTrack = project.tracks.find((track) => track.name === 'Overlay')!;
  const subtitleClip = createSubtitleClip(subtitleTrack.id, project.width, project.height, 0);
  const textClip = createTextClip(overlayTrack.id, project.width, project.height, 0);
  project.tracks.push(subtitleTrack);
  project.clips = [subtitleClip, textClip];

  expect(resolveInitialVideoEditorSelection(project)).toEqual({
    clipId: textClip.id,
    kind: VideoEditorSelectionKind.CLIP,
  });
});

it('toggles independent clips and preserves a stable range anchor', async () => {
  const { selectVideoEditorClip } = await import('./model');
  const order = ['a', 'b', 'c'];
  const first = selectVideoEditorClip({ kind: 'scene' }, 'a', order, 'replace');
  const group = selectVideoEditorClip(first, 'c', order, 'toggle');
  expect(group).toEqual({ kind: 'clip-group', clipIds: ['a', 'c'], anchorClipId: 'a' });
  expect(selectVideoEditorClip(group, 'b', order, 'range')).toEqual({
    kind: 'clip-group',
    clipIds: ['a', 'b'],
    anchorClipId: 'a',
  });
  expect(selectVideoEditorClip(group, 'c', order, 'toggle')).toEqual({ kind: 'clip', clipId: 'a' });
  expect(selectVideoEditorClip(first, 'a', order, 'toggle')).toEqual({ kind: 'scene' });
});

it('discards missing members and never selects an unknown clip', async () => {
  const { selectVideoEditorClip } = await import('./model');
  const selection = { kind: 'clip-group' as const, clipIds: ['gone', 'a'], anchorClipId: 'gone' };
  expect(selectVideoEditorClip(selection, 'b', ['a', 'b'], 'toggle')).toEqual({
    kind: 'clip-group',
    clipIds: ['a', 'b'],
    anchorClipId: 'a',
  });
  expect(selectVideoEditorClip({ kind: 'clip', clipId: 'a' }, 'missing', ['a'], 'replace')).toEqual(
    { kind: 'clip', clipId: 'a' }
  );
});
