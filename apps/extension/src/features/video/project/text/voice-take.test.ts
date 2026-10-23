import {
  reviewSpeechTextSignature,
  type ReviewSpeechTranscript,
} from '../../review/speech-transcript';
import { applyVideoProjectClipsPatch } from '../mutation';
import { getProjectAssetUses } from '../media-usage';
import { removeVideoProjectLibrarySources } from '../library-source-removal';
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

function passiveTranscript(): ReviewSpeechTranscript {
  const profile = {
    modelId: 'retired-model',
    voiceId: 'retired-voice',
    responseFormat: 'pcm' as const,
  };
  return {
    version: 1,
    transcriptionModelId: 'retired-recognizer',
    profile,
    phrases: [
      {
        id: 'phrase',
        start: 0,
        end: 3,
        text: 'Edited',
        originalText: 'Recognized',
        revision: 2,
        alignment: 'word',
        words: [{ text: 'Edited', start: 0, end: 1 }],
      },
    ],
    replacements: [
      {
        id: 'replacement',
        phraseId: 'phrase',
        start: 0,
        end: 3,
        duration: 2,
        assetId: 'project-asset:passive-replacement',
        revision: 1,
        text: 'Historical',
        textSignature: reviewSpeechTextSignature('Historical', profile),
        profile,
      },
    ],
  };
}

it('requires schema 44 and preserves detached passive transcript through split and reopen', () => {
  const { project, clip, asset } = fixture();
  const transcript = passiveTranscript();
  transcript.replacements.push({
    ...transcript.replacements[0]!,
    id: 'kept-replacement',
    start: 3,
    end: 6,
    assetId: 'project-asset:kept-replacement',
  });
  const retained = { ...clip, transcript };
  const replacement = {
    ...asset,
    id: transcript.replacements[0]!.assetId,
    source: { kind: 'project-asset' as const, projectAssetId: 'passive-bytes' },
  };
  project.assets.push(replacement, { ...asset, id: 'project-asset:kept-replacement' });
  for (const version of [2, 30, 31, 42, 43] as const)
    expect(parseHydratableVideoProject({ ...project, version, clips: [retained] })).toBeNull();
  const admitted = applyVideoProjectClipsPatch(project, [retained]);
  expect(admitted.version).toBe(44);
  expect(isExportReadyVideoProject(admitted)).toBe(true);
  const reopened = hydrateVideoProject(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(admitted)))!
  );
  const audio = reopened.clips[0]!;
  expect(audio).toMatchObject({ transcript, textSnapshot: clip.textSnapshot });
  if (audio.type !== 'AUDIO') throw new Error('Expected audio');
  audio.transcript!.phrases[0]!.words![0]!.text = 'Changed later';
  expect(transcript.phrases[0]!.words![0]!.text).toBe('Edited');
  const pieces = splitClipAfterOverwrite(retained, [{ start: 4, end: 5 }], new Map());
  expect(pieces).toHaveLength(2);
  for (const piece of pieces) expect(piece).toMatchObject({ transcript });
  expect(getProjectAssetUses(admitted)).toContainEqual({
    kind: 'clip',
    clipId: clip.id,
    assetId: replacement.id,
  });
  const removed = removeVideoProjectLibrarySources(admitted, [replacement.source]);
  expect(removed.clips[0]).toMatchObject({
    transcript: { ...transcript, replacements: [transcript.replacements[1]!] },
    textSnapshot: clip.textSnapshot,
  });
  expect(isExportReadyVideoProject(removed)).toBe(true);
  expect(retained.transcript.replacements).toHaveLength(2);
  expect(getProjectAssetUses(removed)).toContainEqual({
    kind: 'clip',
    clipId: clip.id,
    assetId: 'project-asset:kept-replacement',
  });
});

it.each(['missing', 'video', 'too-short'] as const)(
  'retains hydratable transcript but refuses %s replacement resources',
  (failure) => {
    const { project, clip, asset } = fixture();
    const transcript = passiveTranscript();
    project.version = 44;
    project.clips = [{ ...clip, transcript }];
    if (failure !== 'missing')
      project.assets.push({
        ...asset,
        id: transcript.replacements[0]!.assetId,
        type: failure === 'video' ? 'VIDEO' : 'AUDIO',
        metadata: { ...asset.metadata, duration: failure === 'too-short' ? 1 : 12 },
      });
    expect(parseHydratableVideoProject(project)).not.toBeNull();
    expect(isExportReadyVideoProject(project)).toBe(false);
  }
);

it.each(['transcript', 'phrase', 'word', 'replacement', 'profile', 'replacement-profile'] as const)(
  'refuses unknown passive %s fields instead of discarding them',
  (level) => {
    const { clip } = fixture();
    const transcript = passiveTranscript();
    const target =
      level === 'transcript'
        ? transcript
        : level === 'phrase'
          ? transcript.phrases[0]!
          : level === 'word'
            ? transcript.phrases[0]!.words![0]!
            : level === 'replacement'
              ? transcript.replacements[0]!
              : level === 'profile'
                ? transcript.profile!
                : transcript.replacements[0]!.profile;
    Object.assign(target, { unsupported: true });
    expect(isVideoProjectClip({ ...clip, transcript })).toBe(false);
  }
);

it.each([
  null,
  { version: 1, phrases: [], replacements: null },
  { ...passiveTranscript(), phrases: [{ ...passiveTranscript().phrases[0]!, end: -1 }] },
  {
    ...passiveTranscript(),
    replacements: [{ ...passiveTranscript().replacements[0]!, textSignature: 'invalid' }],
  },
])('refuses malformed passive transcript %j', (transcript) => {
  const { clip, asset } = fixture();
  expect(isVideoProjectClip({ ...clip, transcript })).toBe(false);
  expect(
    isVideoProjectClip({
      ...createVideoClipFromAsset('track', { ...asset, type: 'VIDEO' }, 640, 360),
      transcript: passiveTranscript(),
    })
  ).toBe(false);
});
