import { describe, expect, it } from 'vitest';
import {
  parseReviewOriginalSpeech,
  parseReviewOriginalSpeechTranscript,
  projectOriginalSpeech,
  type ReviewOriginalSpeech,
} from './original-speech';
import {
  applyReviewSpeechReplacements,
  editReviewSpeechPhrase,
  mergeReviewSpeechPhrases,
  restoreReviewSpeechReplacements,
  splitReviewSpeechPhrase,
  reviewSpeechTextSignature,
} from './speech-transcript';
import { parseReviewSpeechTranscript } from './speech-validation';
import { buildReviewTimeMap } from './timeline';
import { createQuickEditAdvancedState } from './advanced/defaults';
import {
  loadQuickEditAdvancedContentState,
  loadQuickEditAdvancedState,
} from './advanced/validation';
import { reviewAdvancedContentBaseline } from './document';
import { createNeutralPresentationSettings } from './advanced/presentation';
import { createQuickEditWatermark } from './advanced/watermark';

const profile = { modelId: 'tts', voiceId: 'alloy', responseFormat: 'mp3' as const };
function speech(): ReviewOriginalSpeech {
  return {
    enabled: true,
    transcript: {
      version: 1,
      profile,
      transcriptionModelId: 'stt',
      phrases: [
        {
          id: 'phrase',
          start: 2,
          end: 8,
          text: 'new',
          originalText: 'old',
          revision: 0,
          alignment: 'segment',
        },
      ],
      replacements: [
        {
          id: 'accepted',
          assetId: 'project-asset:accepted',
          phraseId: 'phrase',
          start: 2,
          end: 8,
          duration: 5,
          revision: 0,
          text: 'new',
          profile,
          textSignature: reviewSpeechTextSignature('new', profile),
          enabled: true,
          originalVolume: 0.25,
        },
      ],
    },
  };
}

describe('original speech durable specialization', () => {
  it('roundtrips strict fields, normalizes only missing enabled and leaves microphone semantics unchanged', () => {
    const value = speech();
    expect(parseReviewOriginalSpeech(value)).toEqual(value);
    const { enabled: _enabled, ...replacement } = value.transcript.replacements[0]!;
    expect(
      parseReviewOriginalSpeechTranscript({ ...value.transcript, replacements: [replacement] })
        ?.replacements[0]?.enabled
    ).toBe(true);
    for (const originalVolume of [undefined, -1, 1.1, NaN, Infinity, '0'])
      expect(
        parseReviewOriginalSpeechTranscript({
          ...value.transcript,
          replacements: [{ ...replacement, originalVolume }],
        })
      ).toBeNull();
    expect(
      parseReviewOriginalSpeechTranscript({
        ...value.transcript,
        replacements: [{ ...replacement, enabled: 'true' }],
      })
    ).toBeNull();
    expect(parseReviewOriginalSpeech({ ...value, enabled: undefined })).toBeNull();
    expect(parseReviewOriginalSpeechTranscript({ ...value.transcript, version: 2 })).toBeNull();
    expect(
      parseReviewOriginalSpeechTranscript({
        ...value.transcript,
        replacements: [replacement, { ...replacement, id: 'overlap' }],
      })
    ).toBeNull();
    expect(parseReviewSpeechTranscript(value.transcript)?.replacements[0]).not.toHaveProperty(
      'originalVolume'
    );
    expect(
      parseReviewOriginalSpeechTranscript({
        ...value.transcript,
        phrases: [{ ...value.transcript.phrases[0], words: [{ text: 'bad', start: 0, end: 1 }] }],
      })
    ).toBeNull();
  });

  it('preserves accepted gain/enablement through draft edit, split, merge, apply and restore', () => {
    const transcript = speech().transcript;
    transcript.replacements[0]!.enabled = false;
    const edited = editReviewSpeechPhrase(transcript, 'phrase', { text: 'draft' });
    expect(edited.ok && edited.transcript.replacements).toEqual(transcript.replacements);
    const split = splitReviewSpeechPhrase(transcript, 'phrase', {
      id: 'second',
      time: 5,
      leftText: 'left',
      rightText: 'right',
    });
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.transcript.replacements[0]?.originalVolume).toBe(0.25);
    const merged = mergeReviewSpeechPhrases(split.transcript, 'phrase', 'second');
    expect(merged.ok && merged.transcript.replacements).toEqual(transcript.replacements);
    const applied = applyReviewSpeechReplacements(
      { ...transcript, replacements: [] },
      transcript.replacements
    );
    expect(applied.ok && applied.transcript.replacements).toEqual(transcript.replacements);
    if (applied.ok) {
      expect(applied.transcript.replacements[0]?.enabled).toBe(false);
      expect(applied.transcript.replacements[0]?.profile).not.toBe(profile);
      expect(
        restoreReviewSpeechReplacements(applied.transcript, []).replacements[0]?.originalVolume
      ).toBe(0.25);
      expect(
        restoreReviewSpeechReplacements(applied.transcript, ['accepted']).replacements
      ).toEqual([]);
    }
    const recognized = {
      ...transcript,
      phrases: [{ ...transcript.phrases[0]!, text: 'recognized', revision: 1 }],
    };
    expect(parseReviewOriginalSpeechTranscript(recognized)?.replacements).toEqual(
      transcript.replacements
    );
  });

  it('preserves schema7 current/history content and schema6 presentation/schema5 watermark without synthesis', () => {
    const state = createQuickEditAdvancedState();
    state.audio.originalSpeech = speech();
    expect(loadQuickEditAdvancedState(structuredClone(state))).toEqual(state);
    const content = reviewAdvancedContentBaseline(state);
    expect(loadQuickEditAdvancedContentState(structuredClone(content))).toEqual(content);
    for (const schemaVersion of [6, 8]) {
      expect(loadQuickEditAdvancedState({ ...state, schemaVersion })).toBeNull();
      expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion })).toBeNull();
    }
    delete state.audio.originalSpeech;
    state.presentation = createNeutralPresentationSettings();
    state.watermark = createQuickEditWatermark('Mark');
    expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 6 })).toEqual(state);
    expect(
      loadQuickEditAdvancedContentState({
        ...reviewAdvancedContentBaseline(state),
        schemaVersion: 6,
      })
    ).toEqual(reviewAdvancedContentBaseline(state));
    delete state.presentation;
    expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 5 })).toEqual(state);
    expect(
      loadQuickEditAdvancedContentState({
        ...reviewAdvancedContentBaseline(state),
        schemaVersion: 5,
      })
    ).toEqual(reviewAdvancedContentBaseline(state));
    expect(state.audio).not.toHaveProperty('originalSpeech');
  });
});

it('uses one native-to-result projection across cuts and speed, retaining short-generation tail attenuation', () => {
  const value = speech();
  const timeMap = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 3, end: 4, requestedStart: 3, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 4,
      end: 7,
      requestedStart: 4,
      requestedEnd: 7,
      rate: 2,
      audio: 'mute',
    },
  ]);
  const projected = projectOriginalSpeech({ speech: value, timeMap });
  expect(projected.originalRanges).toEqual([{ start: 2, end: 8, volume: 0.25 }]);
  expect(projected.clips).toEqual([
    {
      id: 'revoice:accepted:2',
      assetId: 'project-asset:accepted',
      sourceOffset: 0,
      timelineStart: 2,
      duration: 1,
      playbackRate: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: 'revoice:accepted:4',
      assetId: 'project-asset:accepted',
      sourceOffset: 2,
      timelineStart: 3,
      duration: 1.5,
      playbackRate: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ]);
  expect(projected.clips.every((clip) => !clip.transcript && !clip.sourceAnchor)).toBe(true);
  expect(
    projectOriginalSpeech({
      speech: value,
      timeMap: buildReviewTimeMap(10, [
        { id: 'all', kind: 'cut', start: 2, end: 8, requestedStart: 2, requestedEnd: 8 },
      ]),
    }).clips
  ).toEqual([]);
  expect(value.transcript.replacements).toHaveLength(1);
  value.transcript.replacements[0]!.enabled = false;
  expect(projectOriginalSpeech({ speech: value, timeMap })).toEqual({
    clips: [],
    originalRanges: [],
  });
  value.transcript.replacements[0]!.enabled = true;
  value.enabled = false;
  expect(projectOriginalSpeech({ speech: value, timeMap })).toEqual({
    clips: [],
    originalRanges: [],
  });
  expect(projectOriginalSpeech({ speech: undefined, timeMap })).toEqual({
    clips: [],
    originalRanges: [],
  });
});
