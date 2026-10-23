import { expect, it } from 'vitest';
import { createReviewCaptionSettings } from '../../review/text-document';
import { parseVideoProjectTextDocuments } from './validation';
import type { VideoProjectTextDocument } from './types';

function document(id = 'document'): VideoProjectTextDocument {
  return {
    id,
    binding: { kind: 'project' },
    document: {
      version: 1,
      fragments: [
        {
          id: 'phrase',
          text: 'Исправленный текст',
          originalText: 'Исходный текст',
          revision: 2,
          timingRevision: 1,
          start: 1,
          end: 3,
          timeDomain: 'result',
          alignment: 'manual',
          showInVideo: true,
          language: 'ru',
          derivedFrom: ['recognized'],
          origin: { kind: 'original', start: 4, end: 6 },
        },
      ],
    },
    captions: createReviewCaptionSettings(),
  };
}

it('retains the gallery document and caption semantics through a JSON roundtrip', () => {
  const authored = document();
  expect(parseVideoProjectTextDocuments(JSON.parse(JSON.stringify([authored])))).toEqual([
    authored,
  ]);
});

it('keeps independent documents with locally equal phrase identities', () => {
  const first = document('first');
  const second = document('second');
  expect(parseVideoProjectTextDocuments([first, second])).toEqual([first, second]);
  expect(parseVideoProjectTextDocuments([first, first])).toBeNull();
});

it('requires source clocks and an explicit source instance for source-bound text', () => {
  const source = document();
  source.binding = { kind: 'source', assetId: 'video', sourceInstanceId: 'first-placement' };
  expect(parseVideoProjectTextDocuments([source])).toBeNull();
  source.document.fragments[0]!.timeDomain = 'source';
  expect(parseVideoProjectTextDocuments([source])).toEqual([source]);
  expect(
    parseVideoProjectTextDocuments([{ ...source, binding: { kind: 'source', assetId: 'video' } }])
  ).toBeNull();
  expect(parseVideoProjectTextDocuments([{ ...source, binding: { kind: 'project' } }])).toBeNull();
  expect(
    parseVideoProjectTextDocuments([{ ...source, binding: { ...source.binding, clipId: 'other' } }])
  ).toBeNull();
});

it('rejects invalid authored text and caption settings instead of dropping them', () => {
  const entry = document();
  for (const patch of [{ start: NaN }, { end: 0 }, { revision: -1 }, { showInVideo: 'yes' }]) {
    expect(
      parseVideoProjectTextDocuments([
        {
          ...entry,
          document: { version: 1, fragments: [{ ...entry.document.fragments[0], ...patch }] },
        },
      ])
    ).toBeNull();
  }
  expect(parseVideoProjectTextDocuments([{ ...entry, captions: { enabled: true } }])).toBeNull();
  expect(parseVideoProjectTextDocuments(null)).toBeNull();
  expect(parseVideoProjectTextDocuments([{ ...entry, binding: { kind: 'clip' } }])).toBeNull();
});

it('applies the gallery fragment and text budgets across all documents', () => {
  const first = document('first');
  const second = document('second');
  first.document.fragments = Array.from({ length: 1_001 }, (_, index) => ({
    ...first.document.fragments[0]!,
    id: `phrase-${index}`,
  }));
  second.document.fragments = structuredClone(first.document.fragments);
  expect(parseVideoProjectTextDocuments([first])).not.toBeNull();
  expect(parseVideoProjectTextDocuments([first, second])).toBeNull();
  const textHeavy = Array.from({ length: 70 }, (_, index) => ({
    ...document(`text-${index}`),
    document: {
      version: 1,
      fragments: [
        {
          ...document().document.fragments[0]!,
          text: 'a'.repeat(16_000),
          originalText: 'b'.repeat(16_000),
        },
      ],
    },
  }));
  expect(parseVideoProjectTextDocuments(textHeavy)).toBeNull();
  expect(
    parseVideoProjectTextDocuments(
      Array.from({ length: 2_001 }, (_, index) => document(String(index)))
    )
  ).toBeNull();
});

it('preserves explicit duration modes only on project-time documents', () => {
  const entry = document();
  for (const durationMode of ['project', 'content']) {
    expect(parseVideoProjectTextDocuments([{ ...entry, durationMode }])).toEqual([
      { ...entry, durationMode },
    ]);
  }
  for (const durationMode of ['clip', '', null, false, 1]) {
    expect(parseVideoProjectTextDocuments([{ ...entry, durationMode }])).toBeNull();
  }
  const source = {
    ...entry,
    binding: { kind: 'source', assetId: 'video', sourceInstanceId: 'first' },
    document: {
      version: 1,
      fragments: entry.document.fragments.map((fragment) => ({
        ...fragment,
        timeDomain: 'source',
      })),
    },
  };
  expect(parseVideoProjectTextDocuments([{ ...source, durationMode: 'project' }])).toBeNull();
});

it('validates display tail limits without changing retained text facts', () => {
  const entry = document();
  entry.resultEndLimits = [{ fragmentId: 'phrase', end: 0.5 }];
  expect(parseVideoProjectTextDocuments(JSON.parse(JSON.stringify([entry])))).toEqual([entry]);
  for (const resultEndLimits of [
    null,
    {},
    [{ fragmentId: 'missing', end: 1 }],
    [{ fragmentId: 'phrase', end: -1 }],
    [{ fragmentId: 'phrase', end: Infinity }],
    [{ fragmentId: 'phrase', end: 86_401 }],
    [
      { fragmentId: 'phrase', end: 1 },
      { fragmentId: 'phrase', end: 2 },
    ],
    [{ fragmentId: 'phrase', end: 1, unknown: true }],
  ])
    expect(parseVideoProjectTextDocuments([{ ...entry, resultEndLimits }])).toBeNull();
  entry.binding = { kind: 'source', assetId: 'asset', sourceInstanceId: 'instance' };
  entry.document.fragments[0]!.timeDomain = 'source';
  expect(parseVideoProjectTextDocuments([entry])).toBeNull();
});
