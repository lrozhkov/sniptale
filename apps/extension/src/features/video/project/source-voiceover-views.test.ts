import { expect, it } from 'vitest';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from './factories/creation';
import { buildReviewTimeMap } from '../review/timeline';
import { resolveSourceVoiceoverNavigation } from './source-voiceover-views';
import { isExportReadyVideoProject } from './validation/root';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 1,
    hasAudio: false,
  });
  const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (source.type !== 'VIDEO') throw new Error('Missing source');
  const audio = createVideoProjectAsset(
    'Voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
  project.tracks.push(track);
  project.assets.push(audio);
  project.version = 31;
  project.duration = 34;
  Object.assign(source, {
    id: 'first',
    startTime: 10,
    duration: 4,
    sourceDuration: 4,
    sourceInstanceId: 'instance',
  });
  project.clips = [source, { ...source, id: 'second', startTime: 30, sourceStart: 4 }];
  project.sourceVoiceoverDocuments = [
    {
      id: 'doc',
      trackId: track.id,
      binding: { kind: 'source', assetId: source.assetId, sourceInstanceId: 'instance' },
      enabled: false,
      reference: buildReviewTimeMap(8, []),
      take: {
        id: 'take',
        assetId: audio.id,
        timelineStart: 0,
        sourceOffset: 0,
        duration: 8,
        volume: 0,
        muted: true,
        fadeIn: 0,
        fadeOut: 0,
        sourceAnchor: [{ start: 0, end: 8, offset: 0, duration: 8 }],
      },
    },
  ];
  expect(isExportReadyVideoProject(project)).toBe(true);
  return project;
}
it.each([
  [0, 'first'],
  [12, 'first'],
  [22, 'first'],
  [29, 'second'],
  [31, 'second'],
  [34, 'second'],
])(
  'finds the nearest occurrence at %s without changing disabled authored data',
  (time, expected) => {
    const project = fixture();
    const before = structuredClone(project);
    const result = resolveSourceVoiceoverNavigation(project, 'doc', Number(time));
    expect(result.nearest?.sourceClipId).toBe(expected);
    expect(result.range).toEqual({ startTime: 10, duration: 24 });
    expect(project).toEqual(before);
  }
);
it('prefers the occurrence starting at a shared endpoint and resolves overlaps deterministically', () => {
  const project = fixture();
  project.clips[1]!.startTime = 14;
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 14).nearest?.sourceClipId).toBe('second');
  project.clips[1]!.startTime = 12;
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 13).nearest?.sourceClipId).toBe('first');
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 15).nearest?.sourceClipId).toBe('second');
  project.clips.push({ ...project.clips[1]!, id: 'a-copy' });
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 15).nearest?.sourceClipId).toBe('a-copy');
  project.clips.reverse();
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 15).nearest?.sourceClipId).toBe('a-copy');
});
it('keeps hidden locked views inspectable and excludes unrelated source instances', () => {
  const project = fixture();
  project.tracks.forEach((track) => {
    track.visible = false;
    track.locked = true;
  });
  const source = project.clips[0]!;
  if (source.type !== 'VIDEO') throw new Error('Missing source');
  project.clips.push({
    ...source,
    id: 'unrelated',
    sourceInstanceId: 'other',
    startTime: 60,
  });
  const result = resolveSourceVoiceoverNavigation(project, 'doc', 59);
  expect(result.nearest?.sourceClipId).toBe('second');
  expect(result.nearest?.sourceVisible).toBe(false);
  expect(result.range).toEqual({ startTime: 10, duration: 24 });
});
it('uses own-tempo projection and returns no interval for missing dormant or source-less documents', () => {
  const project = fixture();
  project.sourceVoiceoverDocuments![0]!.take.tempo = 2;
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 31).range).toEqual({
    startTime: 10,
    duration: 4,
  });
  project.sourceVoiceoverDocuments![0]!.take.dormant = true;
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 31)).toEqual({
    nearest: null,
    range: null,
  });
  expect(resolveSourceVoiceoverNavigation(project, 'missing', 31)).toEqual({
    nearest: null,
    range: null,
  });
  project.sourceVoiceoverDocuments![0]!.take.dormant = false;
  project.clips = [];
  expect(resolveSourceVoiceoverNavigation(project, 'doc', 31)).toEqual({
    nearest: null,
    range: null,
  });
});
