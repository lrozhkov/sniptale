import { expect, it } from 'vitest';
import { EDITOR_HISTORY_LIMITS } from '../../../../features/editor-history/policy';
import {
  decodePortableVideoProjectHistory,
  encodePortableVideoProjectHistory,
  parsePortableVideoProjectHistory,
} from './video-project-history';

const portable = () => ({
  version: 1,
  past: [{ objectId: 'past' }],
  future: [{ objectId: 'future' }],
  recovery: { objectId: 'recovery' },
  sources: [{ kind: 'project-asset', id: 'logical-material' }],
});

it('keeps both directions and recovery while replacing only backing identities', () => {
  const parsed = parsePortableVideoProjectHistory(portable());
  const native = decodePortableVideoProjectHistory(
    parsed,
    new Map([
      ['past', 'native-a'],
      ['future', 'native-b'],
      ['recovery', 'native-c'],
    ]),
    'new-epoch'
  );
  expect(native).toEqual({
    version: 1,
    epoch: 'new-epoch',
    past: [{ assetId: 'native-a' }],
    future: [{ assetId: 'native-b' }],
    recovery: { assetId: 'native-c' },
    sources: portable().sources,
  });
  expect(
    encodePortableVideoProjectHistory(
      native,
      new Map([
        ['native-a', 'past'],
        ['native-b', 'future'],
        ['native-c', 'recovery'],
      ])
    )
  ).toEqual(parsed);
});

it.each([
  { ...portable(), epoch: 'private' },
  { ...portable(), past: [{ assetId: 'native' }] },
  {
    ...portable(),
    future: Array.from({ length: EDITOR_HISTORY_LIMITS.maxActions }, () => ({
      objectId: 'future',
    })),
  },
  { ...portable(), sources: [{ kind: 'unknown', id: 'source' }] },
  {
    ...portable(),
    sources: [
      { kind: 'project-asset', id: 'source' },
      { kind: 'project-asset', id: 'source' },
    ],
  },
  { ...portable(), recovery: null },
])('refuses malformed or native-private history headers %#', (value) => {
  expect(() => parsePortableVideoProjectHistory(value)).toThrow('history');
});

it('refuses an unresolved backing object before producing a native head', () => {
  expect(() =>
    decodePortableVideoProjectHistory(
      parsePortableVideoProjectHistory(portable()),
      new Map(),
      'new'
    )
  ).toThrow('history');
});
