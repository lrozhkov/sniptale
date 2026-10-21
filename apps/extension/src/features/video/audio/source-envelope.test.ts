import { describe, expect, it } from 'vitest';
import { parseSourceAudioAttenuationRanges, parseSourceAudioGainRanges } from './source-envelope';

const range = { id: 'source', start: 0, end: 1, volume: 0.5 };

describe('authored source audio admission', () => {
  it('sorts detached manual ranges and preserves exact adjacent source endpoints', () => {
    const input = [{ ...range, id: 'later', start: 1, end: 1.001234567, volume: 2 }, range];
    const before = structuredClone(input);
    const result = parseSourceAudioGainRanges(input);
    expect(result).toEqual([range, input[0]]);
    expect(input).toEqual(before);
    expect(result?.[0]).not.toBe(range);
  });

  it('retains static overlap, authored order and sub-millisecond positive spans', () => {
    const input = [{ ...range, id: 'overlap', start: 0.5, end: 0.500001 }, range];
    expect(parseSourceAudioAttenuationRanges(input)).toEqual(input);
    expect(parseSourceAudioGainRanges(input)).toBeNull();
    expect(parseSourceAudioAttenuationRanges([{ ...range, volume: 2 }])).toBeNull();
    expect(parseSourceAudioGainRanges([{ ...range, volume: 2 }])).toEqual([
      { ...range, volume: 2 },
    ]);
  });

  it.each([parseSourceAudioGainRanges, parseSourceAudioAttenuationRanges])(
    'refuses malformed identity, scalar and collection data without coercion',
    (parse) => {
      for (const value of [
        null,
        {},
        '[]',
        [null],
        [{ ...range, id: '' }],
        [{ ...range, id: ' padded ' }],
        [{ ...range, id: 'a'.repeat(257) }],
        [range, range],
        [{ ...range, start: -1 }],
        [{ ...range, start: NaN }],
        [{ ...range, end: Infinity }],
        [{ ...range, end: 86_401 }],
        [{ ...range, end: 0 }],
        [{ ...range, volume: '0.5' }],
        [{ ...range, volume: NaN }],
        [{ ...range, volume: -1 }],
        Array.from({ length: 513 }, (_, i) => ({ ...range, id: String(i) })),
      ]) {
        expect(parse(value)).toBeNull();
      }
      expect(parse([])).toEqual([]);
      expect(parse([{ ...range, id: 'a'.repeat(256), end: 86_400, volume: 0 }])).not.toBeNull();
    }
  );

  it('refuses manual overlaps and spans below the established one-millisecond minimum', () => {
    expect(parseSourceAudioGainRanges([range, { ...range, id: 'overlap', start: 0.5 }])).toBeNull();
    expect(parseSourceAudioGainRanges([{ ...range, end: 0.000999999 }])).toBeNull();
    expect(parseSourceAudioGainRanges([{ ...range, end: 0.001 }])).not.toBeNull();
  });
});
