import { expect, it } from 'vitest';
import type { VideoProjectSourceAudioDocument } from '../../../../features/video/project/source-audio';
import { collectRenderableAudioClips, clipAudioClipToExportRange } from './collect';
import {
  sourceVoiceoverPlaybackFixture as fixture,
  pairedSourceVoiceoverPlaybackFixture as pairedFixture,
} from '../../../../features/video/project/source-voiceover-playback.test-support';
import {
  getClipAudioGain,
  getClipCompositeAudioGain,
} from '../../../../features/video/project/timeline/presentation.gain';
import { isExportReadyVideoProject } from '../../../../features/video/project/validation/root';
import { createVideoProjectAsset } from '../../../../features/video/project/factories/creation';
import {
  reviewSpeechTextSignature,
  type ReviewOriginalSpeech,
} from '../../../../features/video/review/speech-transcript';

it('collects whole-entry rendering clocks and result-time fades through export range clipping', () => {
  const { project, clip, document, track } = fixture(2);
  clip.muted = true;
  track.audioVolume = 0.5;
  document.take.transcript = { version: 1, phrases: [], replacements: [] };
  const before = structuredClone(project);
  const voices = collectRenderableAudioClips(project);
  expect(voices).toHaveLength(1);
  const voice = voices[0]!;
  expect(voice).toMatchObject({
    sourceKind: 'source-voiceover',
    assetId: 'voice',
    duration: 2,
    sourceStart: 0.37,
    sourceDuration: 4,
    volume: 0.75,
    fadeInMs: 150,
    fadeOutMs: 300,
    audioFadePhase: { offset: 0, duration: 2 },
  });
  const range = clipAudioClipToExportRange(voice, { start: 0.5, end: 1.5 });
  expect(range).toMatchObject({
    duration: 1,
    sourceStart: 1.37,
    audioFadePhase: { offset: 0.5, duration: 2 },
  });
  if (!('playbackEntry' in voice) || !range || !('playbackEntry' in range))
    throw new Error('Missing whole-entry clock');
  expect(range.playbackEntry).toBe(voice.playbackEntry);
  expect(project).toEqual(before);
});

it('composes paired ducking with existing manual source envelopes and exact export clipping', () => {
  const { project, original, originalTrack, document } = pairedFixture();
  expect(isExportReadyVideoProject(project)).toBe(true);
  original.audioGainStart = original.audioGainEnd = 0.8;
  original.volumeEnvelopeStart = original.volumeEnvelopeEnd = 0.5;
  originalTrack.audioVolume = 2;
  expect(getClipCompositeAudioGain(project, original, 2)).toBeCloseTo(
    getClipAudioGain(original, 2) * 2 * 0.25,
    12
  );
  expect(getClipCompositeAudioGain(project, original, 4)).toBeCloseTo(
    getClipAudioGain(original, 4) * 2,
    12
  );
  const collected = collectRenderableAudioClips(project).find((item) => item.id === original.id);
  expect(collected).toBeDefined();
  if (!collected) throw new Error('Missing paired original sound');
  const range = clipAudioClipToExportRange(collected, { start: 1, end: 3 });
  expect(range).toMatchObject({ duration: 2, sourceStart: 1 });
  expect(document.originalAudioSourceInstanceId).toBe(original.sourceInstanceId);
});

it('keeps source mute, voice master, dormancy and visibility independent', () => {
  const { project, clip, document, track } = fixture();
  clip.muted = true;
  track.audioVolume = 2;
  document.take.muted = true;
  expect(collectRenderableAudioClips(project)).toHaveLength(0);
});

function passiveSourceSpeech(assetId: string): ReviewOriginalSpeech {
  const profile = { modelId: 'tts', voiceId: 'voice', responseFormat: 'wav' as const };
  return {
    enabled: false,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'recognition-model',
      phrases: [
        {
          id: 'phrase',
          start: 1,
          end: 3,
          originalText: 'Original',
          text: 'Draft',
          revision: 2,
          alignment: 'word',
          words: [{ text: 'Original', start: 1, end: 3 }],
        },
      ],
      replacements: [
        {
          id: 'historical',
          phraseId: 'removed-phrase',
          start: 1,
          end: 3,
          duration: 1,
          assetId,
          revision: 1,
          text: 'Accepted',
          profile,
          textSignature: reviewSpeechTextSignature('Accepted', profile),
          enabled: true,
          originalVolume: 0.25,
        },
      ],
    },
  };
}

function passiveProject(enabled: boolean) {
  const { project, original } = pairedFixture();
  project.sourceVoiceoverDocuments = [];
  const material = createVideoProjectAsset(
    'Retained speech',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'passive-history-private' },
    {
      width: 0,
      height: 0,
      duration: 1,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  material.id = 'project-asset:passive-history';
  project.assets.push(material);
  const speech = passiveSourceSpeech(material.id);
  speech.enabled = enabled;
  const envelope: VideoProjectSourceAudioDocument = {
    id: 'source-speech',
    binding: {
      kind: 'source' as const,
      assetId: original.assetId,
      sourceInstanceId: original.sourceInstanceId!,
    },
    ranges: [],
    mutes: [],
  };
  project.sourceAudioDocuments = [{ ...envelope, speech }];
  const baseline = { ...project, sourceAudioDocuments: [envelope] };
  return { project, baseline };
}

it.each([
  'retains passive source speech and replacement-only resources through save reopen and retry',
  'restores passive source speech without scheduling replacement audio',
])('%s', () => {
  for (const enabled of [false, true]) {
    const { project, baseline } = passiveProject(enabled);
    expect(isExportReadyVideoProject(project)).toBe(true);
    const before = structuredClone(project);
    const expected = collectRenderableAudioClips(baseline);
    expect(expected.length).toBeGreaterThan(0);
    expect(collectRenderableAudioClips(project)).toEqual(expected);
    expect(
      collectRenderableAudioClips(project, { rangeStartSeconds: 1, rangeEndSeconds: 3 })
    ).toEqual(collectRenderableAudioClips(baseline, { rangeStartSeconds: 1, rangeEndSeconds: 3 }));
    expect(collectRenderableAudioClips({ ...project, clips: [] })).toEqual([]);
    expect(project).toEqual(before);
  }
});

it.each([false, true])(
  'retains original recognition and alpha replacements without creating sound or gain: enabled=%s',
  (enabled) => {
    const { project, baseline } = passiveProject(enabled);
    const speech = project.sourceAudioDocuments![0]!.speech!;
    speech.transcript.transcriptionModelId = 'stt';
    speech.transcript.phrases = [
      {
        id: 'retained-phrase',
        start: 10,
        end: 12,
        originalText: 'Old',
        text: 'Edited',
        revision: 1,
        alignment: 'segment',
      },
    ];
    speech.transcript.replacements[0] = {
      ...speech.transcript.replacements[0]!,
      id: 'alpha',
      start: 10,
      end: 12,
      phraseId: 'retained-phrase',
      revision: 0,
      originalVolume: 0,
    };
    project.sourceAudioDocuments![0]!.ranges = [{ id: 'manual', start: 0, end: 2, volume: 0.5 }];
    baseline.sourceAudioDocuments[0]!.ranges = project.sourceAudioDocuments![0]!.ranges;
    expect(isExportReadyVideoProject(project)).toBe(true);
    expect(collectRenderableAudioClips(project)).toEqual(collectRenderableAudioClips(baseline));
  }
);
