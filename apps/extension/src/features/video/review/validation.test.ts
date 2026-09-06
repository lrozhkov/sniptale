import { expect, it } from 'vitest';
import { parseReviewAnnotation, parseReviewOperation, parseReviewSource } from './validation';

const source = { duration: 10, width: 100, height: 50, mimeType: 'video/webm', size: 1000 };
const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point', time: 1 } };

it('accepts only finite media and source-time coordinates', () => {
  expect(parseReviewSource(source)).toEqual(source);
  for (const patch of [
    { duration: Infinity },
    { duration: 0 },
    { width: 0.5 },
    { height: -1 },
    { mimeType: 'text/html' },
    { size: NaN },
  ]) {
    expect(parseReviewSource({ ...source, ...patch })).toBeNull();
  }
  for (const time of [-1, Infinity, NaN, 11])
    expect(
      parseReviewAnnotation({ ...annotation, anchor: { kind: 'point', time } }, 10)
    ).toBeNull();
  expect(parseReviewAnnotation({ ...annotation, text: '' }, 10)).toBeNull();
  expect(parseReviewAnnotation({ ...annotation, text: '' }, 10, true)?.text).toBe('');
  expect(parseReviewAnnotation({ ...annotation, text: 'x'.repeat(100_001) }, 10, true)).toBeNull();
});

it('preserves normalized rectangles on moments and intervals, rejects outside coordinates', () => {
  const region = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };
  expect(parseReviewAnnotation({ ...annotation, region }, 10)?.region).toEqual(region);
  for (const patch of [{ x: -1 }, { width: 0 }, { y: 0.8 }, { height: Infinity }]) {
    expect(
      parseReviewAnnotation({ ...annotation, region: { ...region, ...patch } }, 10)
    ).toBeNull();
  }
  expect(
    parseReviewAnnotation(
      { ...annotation, anchor: { kind: 'range', start: 1, end: 2 }, region },
      10
    )
  ).toMatchObject({ region });
  expect(
    parseReviewAnnotation({ ...annotation, anchor: { kind: 'range', start: 2, end: 2 } }, 10)
  ).toBeNull();
});

it('parses typed telemetry references and operations without retaining unrelated boundary fields', () => {
  const value = {
    ...annotation,
    telemetryRef: { kind: 'action', id: 'click:1' },
    untrusted: 'discard',
  };
  expect(parseReviewAnnotation(value, 10)).toEqual({
    ...annotation,
    telemetryRef: value.telemetryRef,
  });
  expect(
    parseReviewAnnotation({ ...value, telemetryRef: { kind: 'detected-object', id: 'a' } }, 10)
  ).toBeNull();
  expect(
    parseReviewOperation({ id: 'op', at: 1, target: 'annotation', before: null, after: value }, 10)
      ?.target
  ).toBe('annotation');
  for (const raw of [
    null,
    {},
    { id: 'op', at: 1, target: 'annotation', before: null, after: null },
  ]) {
    expect(parseReviewOperation(raw, 10)).toBeNull();
  }
});

it('validates effective and requested edit intervals and admitted speed/audio choices', () => {
  const edit = {
    id: 'e',
    kind: 'speed',
    start: 2,
    end: 4,
    requestedStart: 1.8,
    requestedEnd: 4.2,
    rate: 2,
    audio: 'speed',
  };
  const op = { id: 'op', at: 1, target: 'edit', before: null, after: edit };
  expect(parseReviewOperation(op, 10)?.target).toBe('edit');
  for (const patch of [
    { rate: 0 },
    { audio: 'drop-packets' },
    { end: 1 },
    { requestedEnd: 11 },
    { kind: 'unknown' },
  ]) {
    expect(parseReviewOperation({ ...op, after: { ...edit, ...patch } }, 10)).toBeNull();
  }
});
