import { expect, it } from 'vitest';
import {
  parseVideoProjectVoiceTextSnapshot,
  type VideoProjectVoiceTextSnapshot,
} from './voice-take';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../factories/creation';
import { createAudioClipFromAsset, createVideoClipFromAsset } from '../factories/clip';
import { isVideoProjectClip } from '../validation/clips';
import { isExportReadyVideoProject, parseHydratableVideoProject } from '../validation/root';
import { hydrateVideoProject } from '../hydration';
import { VideoTrackKind } from '../types/layout';
import { splitClipAfterOverwrite } from '../timeline/overwrite-segments.helpers';

function snapshot(): VideoProjectVoiceTextSnapshot {
  return {
    version: 1,
    documentId: 'former-document',
    binding: { kind: 'source', assetId: 'former-source', sourceInstanceId: 'former-instance' },
    basisHash: `sha256:${'a'.repeat(64)}`,
    text: {
      kind: 'ai',
      textId: 'former-phrase',
      revision: 2,
      timingRevision: 3,
      text: 'Accepted speech',
      start: 2,
      end: 4,
      timeDomain: 'source',
      profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3', instructions: 'Calm' },
    },
  };
}
function fixture() {
  const project = createEmptyVideoProject('Accepted voice');
  const track = createVideoProjectTrack('Voice', 1, VideoTrackKind.AUDIO);
  const asset = createVideoProjectAsset(
    'Voice.mp3',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice-bytes' },
    {
      duration: 12,
      width: 0,
      height: 0,
      hasAudio: true,
      mimeType: 'audio/mpeg',
      size: 100,
      audioPeaks: null,
    }
  );
  const clip = { ...createAudioClipFromAsset(track.id, asset, 1), textSnapshot: snapshot() };
  project.tracks.push(track);
  project.assets.push(asset);
  project.clips.push(clip);
  project.duration = 13;
  return { project, clip, asset };
}
it('retains historical text without requiring its former document, source or instance', () => {
  const { project, clip } = fixture();
  expect(project.textDocuments).toBeUndefined();
  expect(isExportReadyVideoProject(project)).toBe(true);
  const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(project)));
  expect(reopened).not.toBeNull();
  expect(hydrateVideoProject(reopened!).clips[0]).toMatchObject({
    textSnapshot: clip.textSnapshot,
  });
});
it('returns a detached text, binding and profile snapshot', () => {
  const original = snapshot();
  const parsed = parseVideoProjectVoiceTextSnapshot(original)!;
  original.text.text = 'Changed';
  original.text.profile!.voiceId = 'Other';
  if (original.binding.kind === 'source') original.binding.sourceInstanceId = 'Other';
  expect(parsed.text.text).toBe('Accepted speech');
  expect(parsed.text.profile?.voiceId).toBe('voice');
  expect(parsed.binding).toMatchObject({ sourceInstanceId: 'former-instance' });
});
it.each(['ai', 'microphone', 'gallery'] as const)(
  'uses the shared %s snapshot contract',
  (kind) => {
    const value = snapshot();
    value.text.kind = kind;
    if (kind !== 'ai') delete value.text.profile;
    expect(parseVideoProjectVoiceTextSnapshot(value)).toEqual(value);
  }
);
it.each([
  { version: 2 },
  { documentId: '' },
  { documentId: ' x' },
  { basisHash: 'weak' },
  { binding: { kind: 'project' } },
  { extra: true },
  { text: {} },
])('rejects malformed persisted association %j', (patch) => {
  const { clip, project } = fixture();
  const malformed = { ...snapshot(), ...patch };
  expect(parseVideoProjectVoiceTextSnapshot(malformed)).toBeNull();
  expect(isVideoProjectClip({ ...clip, textSnapshot: malformed })).toBe(false);
  expect(
    parseHydratableVideoProject({ ...project, clips: [{ ...clip, textSnapshot: malformed }] })
  ).toBeNull();
});
it('rejects missing AI profile and unknown profile fields at project admission', () => {
  const { clip } = fixture();
  const value = snapshot();
  delete value.text.profile;
  expect(isVideoProjectClip({ ...clip, textSnapshot: value })).toBe(false);
  expect(
    isVideoProjectClip({
      ...clip,
      textSnapshot: {
        ...snapshot(),
        text: {
          ...snapshot().text,
          profile: { ...snapshot().text.profile, token: 'not-retained' },
        },
      },
    })
  ).toBe(false);
});
it('leaves ordinary clips valid and rejects a speech snapshot on video', () => {
  const { asset } = fixture();
  expect(isVideoProjectClip(createAudioClipFromAsset('track', asset))).toBe(true);
  const video = createVideoClipFromAsset('track', { ...asset, type: 'VIDEO' }, 640, 360);
  expect(isVideoProjectClip({ ...video, textSnapshot: snapshot() })).toBe(false);
});
it('preserves the complete accepted snapshot while splitting and retiming ordinary audio', () => {
  const { clip } = fixture();
  const pieces = splitClipAfterOverwrite(clip, [{ start: 4, end: 5 }], new Map());
  expect(pieces).toHaveLength(2);
  for (const piece of pieces) {
    expect(piece).toMatchObject({ textSnapshot: clip.textSnapshot });
    expect(isVideoProjectClip({ ...piece, playbackRate: 2, duration: piece.duration / 2 })).toBe(
      true
    );
  }
});
