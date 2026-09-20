import { expect, it } from 'vitest';
import { createTempoProcessor } from './tempo';

const sampleRate = 48000;
function tone(frequency: number, length: number) {
  return Float32Array.from(
    { length },
    (_, i) => 0.6 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  );
}
function pitch(data: Float32Array, start: number, end: number) {
  let crossings = 0;
  for (let i = start + 1; i < end; i++) if (data[i - 1]! < 0 && data[i]! >= 0) crossings++;
  return (crossings * sampleRate) / (end - start);
}
it.each([0.5, 1, 1.25, 1.5, 2, 4, 8])(
  'preserves vocal frequency and stereo phase at %sx',
  (rate) => {
    const source = tone(180, sampleRate * 3);
    const count = Math.round(source.length / rate);
    const processor = createTempoProcessor(sampleRate, 2, rate);
    const result = processor.render((c, i) => (source[i] ?? 0) * (c ? -0.5 : 1), count);
    expect(pitch(result[0]!, Math.round(count * 0.2), Math.round(count * 0.8))).toBeCloseTo(
      180,
      -1
    );
    for (let i = 0; i < count; i++) expect(result[1]![i]).toBeCloseTo(-0.5 * result[0]![i]!, 6);
    expect(Math.max(...result[0]!.subarray(0, Math.min(count, sampleRate)))).toBeLessThanOrEqual(
      0.60001
    );
  }
);
it('is identical across arbitrary output chunk boundaries and obeys bounded source reads', () => {
  const source = Float32Array.from(
    { length: sampleRate * 5 },
    (_, i) => Math.sin(i * 0.019 + Math.sin(i * 0.0001)) * 0.4 + Math.sin(i * 0.037) * 0.15
  );
  const count = Math.round(source.length / 1.5);
  const read = (_c: number, i: number) => source[i] ?? 0;
  const whole = createTempoProcessor(sampleRate, 1, 1.5).render(read, count)[0]!;
  const processor = createTempoProcessor(sampleRate, 1, 1.5);
  const result = new Float32Array(count);
  let outside = false;
  for (let frame = 0; frame < count; frame += 7777) {
    const size = Math.min(7777, count - frame);
    const range = processor.inputRange(size);
    const part = processor.render((c, i) => {
      outside ||= i < range.start || i >= range.end;
      return read(c, i);
    }, size);
    result.set(part[0]!, frame);
  }
  expect(outside).toBe(false);
  expect(result).toEqual(whole);
});
it('keeps silence silent and bypasses native-rate samples exactly', () => {
  expect(createTempoProcessor(sampleRate, 1, 2).render(() => 0, 1234)[0]).toEqual(
    new Float32Array(1234)
  );
  const source = tone(200, 4000);
  expect(
    createTempoProcessor(sampleRate, 1, 1).render((_c, i) => source[i]!, source.length)[0]
  ).toEqual(source);
  expect(() => createTempoProcessor(sampleRate, 1, NaN)).toThrow();
  expect(() => createTempoProcessor(sampleRate, 0, 2)).toThrow();
  expect(() => createTempoProcessor(sampleRate, 1, 2).render(() => 0, -1)).toThrow();
});
