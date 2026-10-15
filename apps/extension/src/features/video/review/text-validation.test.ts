import { expect, it } from 'vitest';
import { createQuickEditAdvancedState, createQuickEditAdvancedContent } from './advanced/defaults';
import {
  loadQuickEditAdvancedState,
  loadQuickEditAdvancedContentState,
} from './advanced/validation';
import { reviewAdvancedContentBaseline, replayReviewHistory } from './document';
import {
  addReviewTextFragment,
  createReviewCaptionSettings,
  createReviewTextDocument,
} from './text-document';
import { parseReviewTextDocument, parseReviewVoiceTextSnapshot } from './text-validation';
import { QUICK_EDIT_ADVANCED_SCHEMA_VERSION } from './advanced/types';
import type { ReviewSource } from './types';

function textDocument() {
  const result = addReviewTextFragment(createReviewTextDocument(), {
    id: 'text',
    start: 2,
    end: 4,
    text: 'Привет',
  });
  if (!result.ok) throw new Error('fixture');
  return result.document;
}

it('parses overlapping text in authored order and rejects duplicate IDs or invalid provenance', () => {
  const fragment = textDocument().fragments[0]!;
  const document = { version: 1, fragments: [fragment, { ...fragment, id: 'two' }] };
  expect(parseReviewTextDocument(document)).toEqual(document);
  expect(parseReviewTextDocument({ ...document, fragments: [fragment, fragment] })).toBeNull();
  expect(
    parseReviewTextDocument({
      version: 1,
      fragments: [{ ...fragment, origin: { kind: 'music', start: 0, end: 2 } }],
    })
  ).toBeNull();
  expect(
    parseReviewTextDocument({
      version: 1,
      fragments: [{ ...fragment, origin: { kind: 'voiceover', start: 0, end: 2 } }],
    })
  ).toBeNull();
  expect(
    parseReviewTextDocument({
      version: 1,
      fragments: Array.from({ length: 2_001 }, (_, i) => ({ ...fragment, id: String(i) })),
    })
  ).toBeNull();
});

it('preserves text and scene captions through advanced parsing, baseline and undo/redo', () => {
  const state = {
    ...createQuickEditAdvancedState(),
    text: textDocument(),
    captions: createReviewCaptionSettings(),
  };
  const parsed = loadQuickEditAdvancedState(JSON.parse(JSON.stringify(state)));
  expect(parsed).toEqual(state);
  const before = createQuickEditAdvancedContent();
  const after = reviewAdvancedContentBaseline(state);
  expect(loadQuickEditAdvancedContentState(after)).toEqual(after);
  expect(loadQuickEditAdvancedContentState(loadQuickEditAdvancedContentState(after))).toEqual(
    after
  );
  const source: ReviewSource = {
    duration: 10,
    width: 1920,
    height: 1080,
    mimeType: 'video/webm',
    size: 100,
  };
  const history = [{ id: 'change', at: 1, target: 'advancedContent' as const, before, after }];
  expect(replayReviewHistory(history, 1, source).advancedContent.text).toEqual(state.text);
  expect(replayReviewHistory(history, 0, source).advancedContent.text).toBeUndefined();
  expect(loadQuickEditAdvancedState(createQuickEditAdvancedState())).toEqual(
    createQuickEditAdvancedState()
  );
  expect(
    loadQuickEditAdvancedContentState({
      ...after,
      text: { version: 1, fragments: [{ ...state.text.fragments[0], end: 0 }] },
    })
  ).toBeNull();
});

it('keeps immutable voice snapshots without requiring a surviving fragment and validates AI profile', () => {
  const value = {
    kind: 'microphone',
    textId: 'deleted-text',
    revision: 2,
    timingRevision: 1,
    text: 'Old text',
    start: 1,
    end: 4,
    timeDomain: 'result',
  };
  expect(parseReviewVoiceTextSnapshot(value)).toEqual(value);
  expect(parseReviewVoiceTextSnapshot({ ...value, kind: 'ai' })).toBeNull();
  const profile = { modelId: 'voice-model', voiceId: 'alloy', responseFormat: 'mp3' };
  expect(parseReviewVoiceTextSnapshot({ ...value, kind: 'ai', profile })).toMatchObject({
    profile,
  });
  const state = createQuickEditAdvancedState();
  state.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'project-asset:voice',
      timelineStart: 1,
      sourceOffset: 0,
      duration: 2,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      textSnapshot: {
        kind: 'microphone',
        textId: 'deleted-text',
        revision: 2,
        timingRevision: 1,
        text: 'Old text',
        start: 1,
        end: 4,
        timeDomain: 'result',
      },
    },
  ];
  expect(loadQuickEditAdvancedState(state)?.audio.voiceover[0]?.textSnapshot).toEqual(value);
  expect(
    loadQuickEditAdvancedState({
      ...state,
      audio: {
        ...state.audio,
        voiceover: [
          { ...state.audio.voiceover[0], textSnapshot: { ...value, text: 'x'.repeat(16_001) } },
        ],
      },
    })
  ).toBeNull();
});

it('opens the previous alpha project without inventing authored text', () => {
  const previous = { ...createQuickEditAdvancedState(), schemaVersion: 11 };
  const loaded = loadQuickEditAdvancedState(previous);
  expect(loaded?.schemaVersion).toBe(QUICK_EDIT_ADVANCED_SCHEMA_VERSION);
  expect(loaded?.text).toBeUndefined();
  expect(loaded?.captions).toBeUndefined();
  expect(loaded?.audio).toEqual(previous.audio);
  expect(
    loadQuickEditAdvancedState({
      ...previous,
      schemaVersion: QUICK_EDIT_ADVANCED_SCHEMA_VERSION + 1,
    })
  ).toBeNull();
});
