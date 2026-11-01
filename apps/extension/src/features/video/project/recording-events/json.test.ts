import { describe, expect, it } from 'vitest';
import fixture from './fixtures.json';
import { decodeRecordingEventsJson } from './json';

const encode = (text: string) => new TextEncoder().encode(text);

describe('recording event source JSON', () => {
  it('admits all frozen original UTF-8 blocks without a float serializer roundtrip', () => {
    for (const block of fixture.blocks)
      expect(decodeRecordingEventsJson(encode(block.utf8))).toEqual(block.value);
  });

  it.each([
    '{"count":9007199254740990.9}',
    '{"count":9007199254740992}',
    '{"timeUs":1e3}',
    '{"timeUs":1.0}',
    '{"count":-0}',
    '{"count":-1}',
    '{"cadence":{"ticks":[0,1.0]}}',
    '{"clock":{"timestampQuantumUs":1e3}}',
    '{"point":{"x":1e400}}',
    '{"count":01}',
    '{"count":1,"count":2}',
    '{"data":{"a":1,"\\u0061":2}}',
    '{"point":{"x":0,"x":0.5}}',
    '{"count":NaN}',
    '{"count":Infinity}',
    '{"count":1}null',
    '{"count":1,}',
    '[1,]',
    '\ufeff{"count":1}',
    ' {"count":1}',
    '{"count": 1}',
    '{"count":1}\n',
  ])('refuses invalid source tokens: %s', (text) => {
    expect(decodeRecordingEventsJson(encode(text))).toBeUndefined();
  });

  it('admits safe integer endpoints and ordinary finite coordinate and wheel floats', () => {
    const text =
      '{"count":9007199254740991,"point":{"x":1e-1,"y":-0},"data":{"deltaX":-2.5,"scrollY":1e3}}';
    expect(decodeRecordingEventsJson(encode(text))).toEqual(JSON.parse(text));
  });

  it('rejects malformed UTF-8, excessive nesting and block size', () => {
    expect(decodeRecordingEventsJson(new Uint8Array([0xc3, 0x28]))).toBeUndefined();
    expect(
      decodeRecordingEventsJson(encode('['.repeat(18) + '0' + ']'.repeat(18)))
    ).toBeUndefined();
    expect(decodeRecordingEventsJson(new Uint8Array(65_537))).toBeUndefined();
    expect(decodeRecordingEventsJson(new Uint8Array())).toBeUndefined();
  });

  it('rejects all frozen lexical integer negatives before floating-point conversion', () => {
    for (const negative of fixture.negativeMutations) {
      if (!('replaceToken' in negative) || !('sourceBlock' in negative)) continue;
      const original = fixture.blocks[negative.sourceBlock]?.utf8;
      expect(original).toContain(negative.replaceToken.from);
      if (original === undefined) throw new Error('Missing frozen source block.');
      const mutated = original.replace(negative.replaceToken.from, negative.replaceToken.to);
      expect(decodeRecordingEventsJson(encode(mutated))).toBeUndefined();
    }
  });
});
