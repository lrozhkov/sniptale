import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createVideoClipFromAsset, createAudioClipFromAsset } from '../factories/clip';
import { VideoProjectAssetType } from '../types';
import type { VideoProjectTextDocument } from './types';
import { projectVideoProjectTextFragment } from './projection';

function fixture(audio = false) {
  const project = createEmptyVideoProject('Text');
  if (audio) project.tracks.push(createVideoProjectTrack('Audio', 1, 'AUDIO'));
  const asset = createVideoProjectAsset(
    'Source',
    audio ? VideoProjectAssetType.AUDIO : VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'media' },
    {
      width: 640,
      height: 360,
      duration: 10,
      mimeType: audio ? 'audio/wav' : 'video/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = audio
    ? createAudioClipFromAsset(project.tracks[1]!.id, asset, 2)
    : createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 2);
  if (clip.type !== 'VIDEO' && clip.type !== 'AUDIO') throw new Error('Missing source clip');
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 20;
  const entry: VideoProjectTextDocument = {
    id: 'text',
    binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Two words',
          originalText: 'Two words',
          revision: 0,
          timingRevision: 0,
          alignment: 'word',
          start: 1,
          end: 9,
          timeDomain: 'source',
          showInVideo: true,
          words: [
            { text: 'Two', start: 1, end: 2 },
            { text: 'words', start: 8, end: 9 },
          ],
        },
      ],
    },
  };
  return { project, clip, entry, fragment: entry.document.fragments[0]! };
}

it.each([false, true])('projects video/audio text in the selected instance (audio=%s)', (audio) => {
  const { project, clip, entry, fragment } = fixture(audio);
  expect(projectVideoProjectTextFragment(project, entry, fragment).ranges).toEqual([
    { start: 3, end: 11 },
  ]);
  project.clips.push({ ...clip, id: 'other', startTime: 14 });
  expect(projectVideoProjectTextFragment(project, entry, fragment).ranges).toEqual([
    { start: 3, end: 11 },
  ]);
  clip.playbackRate = 2;
  clip.duration = 5;
  expect(projectVideoProjectTextFragment(project, entry, fragment).ranges).toEqual([
    { start: 2.5, end: 6.5 },
  ]);
  expect(fragment.words?.[1]?.start).toBe(8);
});

it('supports reordered and overlapping source pieces and reports actual missing source intervals', () => {
  const { project, clip, entry, fragment } = fixture();
  clip.sourceInstanceId = clip.id;
  project.clips = [
    {
      ...clip,
      id: 'late-source-first',
      sourceStart: 6,
      sourceDuration: 4,
      duration: 2,
      playbackRate: 2,
      startTime: 0,
    },
    {
      ...clip,
      id: 'early-source-later',
      sourceStart: 0,
      sourceDuration: 4,
      duration: 4,
      startTime: 1,
    },
  ];
  expect(projectVideoProjectTextFragment(project, entry, fragment)).toEqual({
    excludedFromResult: false,
    partiallyExcluded: true,
    ranges: [
      { start: 0, end: 1.5 },
      { start: 2, end: 5 },
    ],
  });
  project.clips = [];
  expect(projectVideoProjectTextFragment(project, entry, fragment).excludedFromResult).toBe(true);
  project.clips = [{ ...clip }];
  expect(projectVideoProjectTextFragment(project, entry, fragment).partiallyExcluded).toBe(false);
});

it('keeps project-bound text independent of source timing and retains out-of-range authored text', () => {
  const { project, clip, entry, fragment } = fixture();
  entry.binding = { kind: 'project' };
  fragment.timeDomain = 'result';
  clip.startTime = 15;
  clip.playbackRate = 4;
  expect(projectVideoProjectTextFragment(project, entry, fragment).ranges).toEqual([
    { start: 1, end: 9 },
  ]);
  project.duration = 5;
  expect(projectVideoProjectTextFragment(project, entry, fragment)).toEqual({
    excludedFromResult: false,
    partiallyExcluded: true,
    ranges: [{ start: 1, end: 5 }],
  });
  expect(fragment.end).toBe(9);
});
