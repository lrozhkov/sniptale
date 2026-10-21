import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { createRecordingProjectAsset } from '../factories/recording';
import { createVideoProjectAudioScope, resolveVideoProjectAudioTarget } from './audio-scope';

function fixture() {
  const project = createEmptyVideoProject('Audio');
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      duration: 20,
      width: 640,
      height: 360,
      hasAudio: true,
      mimeType: 'video/webm',
      size: 1,
      audioPeaks: null,
    }
  );
  const media = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 4);
  if (media.type !== 'VIDEO') throw new Error('Expected video');
  const clip = { ...media, sourceStart: 2, sourceDuration: 8, duration: 4, playbackRate: 2 };
  project.assets = [asset];
  project.clips = [clip];
  return { project, clip, asset };
}
it('authorizes only the native trimmed span of the selected source at its playback rate', () => {
  const { project, clip, asset } = fixture();
  const scope = createVideoProjectAudioScope(project, 3, clip.id, 2, 10);
  expect(scope).toMatchObject({
    projectId: project.id,
    projectRevision: 3,
    assetId: asset.id,
    target: { kind: 'project-clip', clipId: clip.id },
  });
  if (!scope) throw new Error('Missing scope');
  expect(resolveVideoProjectAudioTarget(project, scope)).toEqual({ clip, asset });
  expect(createVideoProjectAudioScope(project, 3, clip.id, 1, 3)).toBeNull();
  expect(createVideoProjectAudioScope(project, 3, clip.id, 9, 11)).toBeNull();
  expect(createVideoProjectAudioScope(project, -1, clip.id, 2, 3)).toBeNull();
  for (const interval of [
    [NaN, 3],
    [2, Infinity],
    [3, 3],
    [4, 3],
  ]) {
    expect(
      resolveVideoProjectAudioTarget(project, {
        ...scope,
        nativeStart: interval[0]!,
        nativeEnd: interval[1]!,
      })
    ).toBeNull();
  }
  project.clips = [{ ...clip, duration: 2 }];
  expect(resolveVideoProjectAudioTarget(project, scope)).toBeNull();
});
it('requires current clip and asset membership rather than a matching source elsewhere', () => {
  const { project, clip, asset } = fixture();
  const scope = createVideoProjectAudioScope(project, 1, clip.id, 2, 3);
  if (!scope) throw new Error('Missing scope');
  expect(resolveVideoProjectAudioTarget({ ...project, id: 'other' }, scope)).toBeNull();
  expect(
    resolveVideoProjectAudioTarget({ ...project, updatedAt: project.updatedAt + 1 }, scope)
  ).toBeNull();
  expect(resolveVideoProjectAudioTarget({ ...project, clips: [] }, scope)).toBeNull();
  expect(resolveVideoProjectAudioTarget(project, { ...scope, assetId: 'unrelated' })).toBeNull();
  expect(resolveVideoProjectAudioTarget({ ...project, assets: [] }, scope)).toBeNull();
  project.assets = [{ ...asset, metadata: { ...asset.metadata, hasAudio: false } }];
  expect(resolveVideoProjectAudioTarget(project, scope)).toBeNull();
  expect(createVideoProjectAudioScope(project, 1, 'missing', 2, 3)).toBeNull();
});
it('admits AUDIO clips and enforces the source metadata duration', () => {
  const { project, clip, asset } = fixture();
  project.clips = [{ ...clip, type: 'AUDIO' }];
  project.assets = [{ ...asset, type: 'AUDIO', metadata: { ...asset.metadata, duration: 5 } }];
  expect(createVideoProjectAudioScope(project, 1, clip.id, 2, 5)).not.toBeNull();
  expect(createVideoProjectAudioScope(project, 1, clip.id, 2, 6)).toBeNull();
});
it('admits retained recording assets used by supported video and audio clips', () => {
  for (const type of ['VIDEO', 'AUDIO'] as const) {
    const { project, clip } = fixture();
    const asset = createRecordingProjectAsset({
      recordingId: 'recording',
      filename: 'Recording',
      width: 640,
      height: 360,
      duration: 20,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: true,
    });
    project.assets = [asset];
    project.clips = [{ ...clip, type, assetId: asset.id }];
    const scope = createVideoProjectAudioScope(project, 2, clip.id, 2, 10);
    expect(scope).not.toBeNull();
    if (!scope) throw new Error('Recording scope refused');
    expect(resolveVideoProjectAudioTarget(project, scope)?.asset).toEqual(asset);
    asset.metadata.hasAudio = false;
    expect(resolveVideoProjectAudioTarget(project, scope)).toBeNull();
    expect(createVideoProjectAudioScope(project, 2, clip.id, 1, 3)).toBeNull();
  }
});

it('authorizes camera selections in covered authored seconds for signed offsets', () => {
  const { project, clip } = fixture();
  clip.cameraTiming = { offsetSeconds: 4, transitions: 'bounded' };
  expect(createVideoProjectAudioScope(project, 1, clip.id, 4, 10)).not.toBeNull();
  expect(createVideoProjectAudioScope(project, 1, clip.id, 2, 5)).toBeNull();
  clip.cameraTiming.offsetSeconds = -15;
  expect(createVideoProjectAudioScope(project, 1, clip.id, 2, 5)).not.toBeNull();
  expect(createVideoProjectAudioScope(project, 1, clip.id, 4, 6)).toBeNull();
  for (const offsetSeconds of [-100, 100]) {
    clip.cameraTiming.offsetSeconds = offsetSeconds;
    expect(createVideoProjectAudioScope(project, 1, clip.id, 2, 3)).toBeNull();
  }
});
