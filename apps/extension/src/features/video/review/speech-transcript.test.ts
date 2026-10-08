import { describe, expect, it } from 'vitest';
import {
  applyReviewSpeechReplacements,
  editReviewSpeechPhrase,
  mergeReviewSpeechPhrases,
  restoreReviewSpeechReplacements,
  reviewSpeechTextSignature,
  splitReviewSpeechPhrase,
  type ReviewSpeechTranscript,
  type ReviewSpeechReplacement,
} from './speech-transcript';
import { parseReviewSpeechTranscript } from './speech-validation';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from './advanced/types';
import { createQuickEditAdvancedState } from './advanced/defaults';
import {
  loadQuickEditAdvancedState,
  loadQuickEditAdvancedContentState,
} from './advanced/validation';
import { reviewAdvancedContentBaseline } from './document';
import { createQuickEditWebcam } from './advanced/webcam';

const profile = { modelId: 'tts', voiceId: 'alloy', responseFormat: 'mp3' as const };
const transcript = (): ReviewSpeechTranscript => ({
  version: 1,
  profile,
  transcriptionModelId: 'stt',
  replacements: [],
  phrases: [
    {
      id: 'one',
      start: 2,
      end: 6,
      text: 'Edited phrase',
      originalText: 'Original phrase',
      revision: 0,
      alignment: 'segment',
    },
  ],
});
const replacement = (patch: Partial<ReviewSpeechReplacement> = {}): ReviewSpeechReplacement => ({
  id: 'take',
  start: 2,
  end: 6,
  duration: 3,
  assetId: 'project-asset:generated',
  phraseId: 'one',
  revision: 0,
  text: 'Edited phrase',
  textSignature: reviewSpeechTextSignature('Edited phrase', profile),
  profile,
  ...patch,
});

describe('speech draft and immutable accepted audio', () => {
  it('preserves accepted audio through text/boundary edits and refuses stale previews', () => {
    const initial = { ...transcript(), replacements: [replacement()] };
    const edited = editReviewSpeechPhrase(initial, 'one', { text: 'Different', end: 5 });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.transcript.phrases[0]).toMatchObject({
      originalText: 'Original phrase',
      revision: 1,
      alignment: 'manual',
    });
    expect(edited.transcript.replacements).toEqual(initial.replacements);
    expect(applyReviewSpeechReplacements(edited.transcript, [replacement()])).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(initial.phrases[0]!.end).toBe(6);
  });

  it('rejects partial stale-group apply after split, accepts a complete atomic group or explicit restore', () => {
    const initial = { ...transcript(), replacements: [replacement()] };
    const split = splitReviewSpeechPhrase(initial, 'one', {
      id: 'two',
      time: 4,
      leftText: 'Left',
      rightText: 'Right',
    });
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const left = replacement({
      id: 'left',
      end: 4,
      duration: 1,
      revision: 1,
      text: 'Left',
      textSignature: reviewSpeechTextSignature('Left', profile),
    });
    const right = replacement({
      id: 'right',
      start: 4,
      duration: 1,
      phraseId: 'two',
      revision: 1,
      text: 'Right',
      textSignature: reviewSpeechTextSignature('Right', profile),
    });
    expect(applyReviewSpeechReplacements(split.transcript, [left])).toEqual({
      ok: false,
      reason: 'partial-replacement',
    });
    const applied = applyReviewSpeechReplacements(split.transcript, [left, right]);
    expect(applied.ok && applied.transcript.replacements.map((entry) => entry.id)).toEqual([
      'left',
      'right',
    ]);
    expect(applyReviewSpeechReplacements(split.transcript, [left], ['take']).ok).toBe(true);
    expect(restoreReviewSpeechReplacements(split.transcript, ['take']).replacements).toEqual([]);
    const merged = mergeReviewSpeechPhrases(split.transcript, 'one', 'two');
    expect(merged.ok && merged.transcript.phrases[0]).toMatchObject({
      start: 2,
      end: 6,
      text: 'Left Right',
      revision: 2,
    });
    expect(merged.ok && merged.transcript.replacements).toEqual(initial.replacements);
  });

  it('rejects generation too long, overlaps, profile changes and native-gap merge', () => {
    expect(applyReviewSpeechReplacements(transcript(), [replacement({ duration: 4.1 })])).toEqual({
      ok: false,
      reason: 'duration',
    });
    expect(
      applyReviewSpeechReplacements({ ...transcript(), profile: { ...profile, speed: 2 } }, [
        replacement(),
      ])
    ).toEqual({ ok: false, reason: 'stale' });
    expect(
      applyReviewSpeechReplacements(transcript(), [replacement(), replacement({ id: 'other' })])
    ).toEqual({ ok: false, reason: 'invalid' });
    const draft = transcript();
    draft.phrases.push({ ...draft.phrases[0]!, id: 'two', start: 7, end: 8 });
    expect(mergeReviewSpeechPhrases(draft, 'one', 'two')).toEqual({ ok: false, reason: 'invalid' });
    expect(editReviewSpeechPhrase(draft, 'one', { end: 7.5 })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('speech durable codec', () => {
  it('retains new fields and old optional absence, upgrades v3 without losing existing fields', () => {
    const state = createQuickEditAdvancedState();
    state.audio.voiceover.push({
      id: 'clip',
      assetId: 'project-asset:original',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 10,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transcript: { ...transcript(), replacements: [replacement()] },
    });
    expect(loadQuickEditAdvancedState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const content = reviewAdvancedContentBaseline(state);
    expect(loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)))).toEqual(content);
    const legacy = createQuickEditAdvancedState();
    legacy.webcam = createQuickEditWebcam(
      'project-asset:camera',
      { width: 640, height: 480 },
      { width: 1920, height: 1080 }
    );
    expect(loadQuickEditAdvancedState({ ...legacy, schemaVersion: 3 })).toEqual(legacy);
    expect(
      loadQuickEditAdvancedContentState({
        ...reviewAdvancedContentBaseline(legacy),
        schemaVersion: 3,
      })
    ).toEqual(reviewAdvancedContentBaseline(legacy));
    expect(loadQuickEditAdvancedState({ ...legacy, schemaVersion: 5 })).toEqual(legacy);
    expect(
      loadQuickEditAdvancedState({
        ...legacy,
        schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION + 1,
      })
    ).toBeNull();
  });

  it('rejects corrupt references, future versions, overlapping phrases, bad word ranges and excessive counts', () => {
    const initial = { ...transcript(), replacements: [replacement()] };
    expect(parseReviewSpeechTranscript(initial)).toEqual(initial);
    const extendedProfile = {
      ...profile,
      voiceId: ' alloy ',
      instructions: '\u0000'.repeat(10_000),
    };
    const extendedText = '\u0000'.repeat(16_000);
    const extended = {
      ...initial,
      profile: extendedProfile,
      replacements: [
        replacement({
          profile: extendedProfile,
          text: extendedText,
          textSignature: reviewSpeechTextSignature(extendedText, extendedProfile),
        }),
      ],
    };
    expect(parseReviewSpeechTranscript(extended)).toEqual(extended);
    expect(parseReviewSpeechTranscript({ ...initial, version: 2 })).toBeNull();
    expect(
      parseReviewSpeechTranscript({
        ...initial,
        replacements: [replacement({ assetId: 'unknown' })],
      })
    ).toBeNull();
    expect(
      parseReviewSpeechTranscript({
        ...initial,
        replacements: [replacement({ textSignature: 'stale' })],
      })
    ).toBeNull();
    expect(
      parseReviewSpeechTranscript({
        ...initial,
        phrases: [initial.phrases[0], { ...initial.phrases[0], id: 'two' }],
      })
    ).toBeNull();
    expect(
      parseReviewSpeechTranscript({
        ...initial,
        phrases: [{ ...initial.phrases[0], words: [{ text: 'outside', start: 1, end: 3 }] }],
      })
    ).toBeNull();
    expect(
      parseReviewSpeechTranscript({
        ...initial,
        phrases: Array.from({ length: 2001 }, () => initial.phrases[0]),
      })
    ).toBeNull();
  });
});
