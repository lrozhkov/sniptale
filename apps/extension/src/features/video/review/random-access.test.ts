import { expect, it } from 'vitest';
import { isIndependentReviewPacket } from './random-access';

const packet = (...bytes: number[]) => new Uint8Array(bytes);
const avc = packet(1, 0, 0, 0, 255);
it('requires bitstream-confirmed keys and rejects AVC open-GOP recovery', () => {
  expect(isIndependentReviewPacket('avc', packet(0, 0, 0, 2, 0x65, 1), avc, 'key')).toBe(true);
  expect(
    isIndependentReviewPacket('avc', packet(0, 0, 0, 2, 0x06, 1, 0, 0, 0, 2, 0x41, 1), avc, 'key')
  ).toBe(false);
  expect(isIndependentReviewPacket('vp9', packet(130), undefined, null)).toBe(false);
  expect(isIndependentReviewPacket('vp8', packet(1), undefined, 'delta')).toBe(false);
  expect(isIndependentReviewPacket('unknown', packet(0), undefined, 'key')).toBe(false);
});
it('validates packet framing and HEVC independent pictures rather than CRA', () => {
  const config = new Uint8Array(22);
  config[0] = 1;
  config[21] = 3;
  expect(isIndependentReviewPacket('hevc', packet(0, 0, 0, 2, 40, 1), config, 'key')).toBe(true);
  expect(isIndependentReviewPacket('hevc', packet(0, 0, 0, 2, 42, 1), config, 'key')).toBe(false);
  expect(isIndependentReviewPacket('hevc', packet(0, 0, 0, 2, 40, 0), config, 'key')).toBe(false);
  for (const invalid of [
    packet(),
    packet(0, 0, 0),
    packet(0, 0, 0, 9, 0x65),
    packet(0, 0, 0, 0),
    packet(0, 0, 0, 1, 0xe5),
  ])
    expect(isIndependentReviewPacket('avc', invalid, avc, 'key')).toBe(false);
  expect(isIndependentReviewPacket('avc', packet(0, 0, 1, 0x65, 1), undefined, 'key')).toBe(true);
  expect(isIndependentReviewPacket('avc', packet(0, 0, 0, 1, 0x65, 1), undefined, 'key')).toBe(
    true
  );
  expect(isIndependentReviewPacket('avc', packet(7, 0, 0, 1, 0x65, 1), undefined, 'key')).toBe(
    false
  );
  expect(isIndependentReviewPacket('avc', packet(0, 0, 1), undefined, 'key')).toBe(false);
  expect(isIndependentReviewPacket('avc', packet(0x65), packet(0), 'key')).toBe(false);
});
