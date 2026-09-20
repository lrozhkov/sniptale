import { expect, it } from 'vitest';
import { parseReviewAnnotation, parseReviewOperation, parseReviewSource } from './validation';
import { createCanvasComment } from './comments';

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

it('parses canvas comment operations and rejects unbounded or malformed overlay values', () => {
  const comment = createCanvasComment({ id: 'c1', at: 2 });
  const op = { id: 'op9', at: 3, target: 'canvasComment', before: null, after: comment };
  expect(parseReviewOperation(op, 10)).toEqual(op);
  expect(
    parseReviewOperation(
      { id: 'op9', at: 3, target: 'canvasComment', before: comment, after: null },
      10
    )?.target
  ).toBe('canvasComment');
  for (const patch of [
    { position: { x: 1.1, y: 0.5 } },
    { position: { x: 0.5, y: -0.1 } },
    { attachment: 'frame' },
    { visible: 'yes' },
    { start: 4, end: 2 },
    { start: 11 },
    { end: -1 },
  ]) {
    const value = typeof patch === 'object' ? { ...comment, ...patch } : comment;
    expect(
      parseReviewOperation(
        { id: 'op9', at: 3, target: 'canvasComment', before: null, after: value },
        10
      )
    ).toBeNull();
  }
  expect(
    parseReviewOperation(
      {
        id: 'op9',
        at: 3,
        target: 'canvasComment',
        before: null,
        after: { ...comment, style: { ...comment.style, fillPaint: 'red' } },
      },
      10
    )
  ).toBeNull();
  expect(
    parseReviewOperation(
      {
        id: 'op9',
        at: 3,
        target: 'canvasComment',
        before: null,
        after: { ...comment, style: { ...comment.style, radius: 65 } },
      },
      10
    )
  ).toBeNull();
});

it('round-trips linked overlays: annotation link and placement survive parsing', () => {
  const linked = {
    ...createCanvasComment({ id: 'c1', at: 2, annotationId: 'a1', placement: 'below' as const }),
    text: '',
  };
  const op = { id: 'op9', at: 3, target: 'canvasComment', before: null, after: linked };
  expect(parseReviewOperation(op, 10)).toEqual(op);
  const legacy = { ...createCanvasComment({ id: 'c2', at: 2 }) };
  const legacyOp = { id: 'op10', at: 3, target: 'canvasComment', before: null, after: legacy };
  expect(parseReviewOperation(legacyOp, 10)).toEqual(legacyOp);
  const parsedLegacy = parseReviewOperation(legacyOp, 10);
  expect('annotationId' in ((parsedLegacy?.after ?? {}) as Record<string, unknown>)).toBe(false);
  for (const patch of [{ annotationId: 42 }, { placement: 'side' }]) {
    expect(
      parseReviewOperation(
        { id: 'op9', at: 3, target: 'canvasComment', before: null, after: { ...linked, ...patch } },
        10
      )
    ).toBeNull();
  }
});

it('roundtrips custom comment typography and rejects malformed geometry before persistence', () => {
  const comment = createCanvasComment({ id: 'styled', at: 1 });
  comment.style = { ...comment.style, width: 320, fontSize: 18, padding: 12 };
  const operation = { id: 'style', at: 1, target: 'canvasComment', before: null, after: comment };
  expect(parseReviewOperation(JSON.parse(JSON.stringify(operation)), 10)).toEqual(operation);
  for (const patch of [
    { width: 79 },
    { width: 641 },
    { fontSize: 0 },
    { fontSize: 49 },
    { padding: -1 },
    { padding: 33 },
    { width: '320' },
  ]) {
    expect(
      parseReviewOperation(
        { ...operation, after: { ...comment, style: { ...comment.style, ...patch } } },
        10
      )
    ).toBeNull();
  }
});

it('round-trips the focus anchor policy and rejects malformed policy values', () => {
  const operation = {
    id: 'cut-focus',
    at: 1,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    preserveFocusAnchors: true,
  };
  expect(parseReviewOperation(operation, 12)).toEqual(operation);
  for (const invalid of [false, 'true', 1, null])
    expect(parseReviewOperation({ ...operation, preserveFocusAnchors: invalid }, 12)).toBeNull();
});

it('preserves the voiceover anchor policy and rejects invalid policy values', () => {
  const operation = {
    id: 'voice-cut',
    at: 1,
    target: 'edit',
    before: null,
    after: { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    preserveVoiceoverAnchors: true,
  };
  expect(parseReviewOperation(operation, 12)).toEqual(operation);
  for (const invalid of [false, 'true', null])
    expect(
      parseReviewOperation({ ...operation, preserveVoiceoverAnchors: invalid }, 12)
    ).toBeNull();
});
