import { describe, expect, it } from 'vitest';
import fixture from './fixtures.json';
import type { RecordingEventRecord } from './types';
import {
  decodeRecordingEventCadence,
  encodeRecordingEventCadence,
  isRecordingEventRecord,
  isRecordingEventsDescriptor,
} from './records';

const records: RecordingEventRecord[] = fixture.blocks
  .flatMap<unknown>((block) => block.value.records)
  .map((record) => {
    if (!isRecordingEventRecord(record)) throw new Error('Invalid frozen source fact.');
    return record;
  });

describe('recording event closed facts', () => {
  it.each(['Shift+Tab', 'Ctrl+Home', 'Alt+Shift', 'Insert', 'Ctrl+PageDown', 'Shift+F24'])(
    'retains accepted browser service-key facts: %s',
    (label) => {
      const record = records.find((item) => item.kind === 'action' && item.action.kind === 'KEY');
      if (!record || record.kind !== 'action') throw new Error('Missing key fact.');
      expect(isRecordingEventRecord({ ...record, action: { ...record.action, label } })).toBe(true);
    }
  );
  it('admits every shared source family and the committed descriptor', () => {
    expect(records).toHaveLength(18);
    for (const record of records) expect(isRecordingEventRecord(record), record.kind).toBe(true);
    expect(isRecordingEventsDescriptor(fixture.descriptor)).toBe(true);
  });

  it.each([
    'targetId',
    'targetTag',
    'targetType',
    'text',
    'value',
    'keyboardRhythm',
    'keyboardRepeats',
  ])('refuses private or growing fields: %s', (key) => {
    for (const record of records)
      expect(isRecordingEventRecord({ ...record, [key]: 'private' })).toBe(false);
  });

  it('requires every explicit nullable field and rejects private nested payloads', () => {
    for (const record of records) {
      const clone: Record<string, unknown> = { ...structuredClone(record) };
      const nested = 'action' in clone ? clone['action'] : clone['signal'];
      if (typeof nested !== 'object' || nested === null || !('data' in nested)) continue;
      const data = nested.data;
      if (typeof data !== 'object' || data === null) continue;
      Reflect.set(data, 'targetId', 'private');
      expect(isRecordingEventRecord(clone)).toBe(false);
    }
    const original = records.find(
      (record) => record.kind === 'action' && record.action.kind === 'KEY'
    );
    if (!original || original.kind !== 'action') throw new Error('Missing key fact.');
    const clone = structuredClone(original);
    Reflect.deleteProperty(clone.action.data, 'upTimeUs');
    expect(isRecordingEventRecord(clone)).toBe(false);
  });

  it('preserves exact normal and unknown counts while refusing protected counts or fine intervals', () => {
    const unknown = records.find(
      (record) =>
        record.kind === 'signal' &&
        record.signal.kind === 'typing' &&
        record.signal.data.privacy === 'unknown'
    );
    const protectedRecord = records.find(
      (record) =>
        record.kind === 'signal' &&
        record.signal.kind === 'typing' &&
        record.signal.data.privacy === 'protected'
    );
    if (
      !unknown ||
      unknown.kind !== 'signal' ||
      !protectedRecord ||
      protectedRecord.kind !== 'signal'
    )
      throw new Error('Missing privacy facts.');
    expect(unknown.signal.data).toMatchObject({ eventCount: 70000, privacy: 'unknown' });
    for (const eventCount of [0, 1, 65535, 70000]) {
      expect(
        isRecordingEventRecord({
          ...protectedRecord,
          signal: {
            ...protectedRecord.signal,
            data: { ...protectedRecord.signal.data, eventCount },
          },
        })
      ).toBe(false);
    }
    expect(
      isRecordingEventRecord({
        ...protectedRecord,
        signal: { ...protectedRecord.signal, endTimeUs: 234567 },
      })
    ).toBe(false);
  });

  it('decodes exact delta and run-length cadence and refuses count or overflow corruption', () => {
    const cadences = records.filter((record) => record.kind === 'keyboard-repeat-block');
    expect(cadences).toHaveLength(2);
    for (const record of cadences) {
      if (record.kind !== 'keyboard-repeat-block') throw new Error('Missing cadence.');
      expect(decodeRecordingEventCadence(record.cadence)).toHaveLength(record.cadence.count);
      expect(
        decodeRecordingEventCadence({ ...record.cadence, count: record.cadence.count + 1 })
      ).toBeNull();
      expect(
        decodeRecordingEventCadence({ ...record.cadence, startTimeUs: Number.MAX_SAFE_INTEGER })
      ).toBeNull();
    }
    const base = {
      version: 1,
      id: 'cadence',
      startTimeUs: 7,
      quantumUs: 1,
      count: 512,
      encoding: 'rle-us',
      ticks: [0, 1, 3, 511],
    };
    expect(decodeRecordingEventCadence(base)?.at(-1)).toBe(1540);
    expect(decodeRecordingEventCadence({ ...base, count: 513, ticks: [0, 513] })).toBeNull();
    expect(decodeRecordingEventCadence({ ...base, ticks: [0, 0, 3, 512] })).toBeNull();
    expect(decodeRecordingEventCadence({ ...base, ticks: [0, 1, 3] })).toBeNull();
  });

  it('rejects unsupported labels, warning provenance and wheel/scroll substitution', () => {
    for (const record of records) {
      if (record.kind === 'action' && record.action.kind === 'KEY') {
        for (const label of [
          'a',
          'Shift+A',
          'secret typed text',
          'Ctrl+Ctrl+A',
          'Shift+Shift',
          'F01',
          'F25',
          'Ctrl+secret typed text',
        ])
          expect(isRecordingEventRecord({ ...record, action: { ...record.action, label } })).toBe(
            false
          );
        for (const label of ['F24', 'Ctrl+F5', 'Ctrl+Alt+Shift+Meta+A'])
          expect(isRecordingEventRecord({ ...record, action: { ...record.action, label } })).toBe(
            true
          );
      }
      if (record.kind === 'action' && record.action.kind === 'SCROLL')
        expect(
          isRecordingEventRecord({
            ...record,
            action: { ...record.action, data: { ...record.action.data, eventType: 'scroll' } },
          })
        ).toBe(false);
      if (record.kind === 'signal' && record.signal.kind === 'static-frame')
        expect(
          isRecordingEventRecord({
            ...record,
            signal: { ...record.signal, data: { ...record.signal.data, source: 'private-error' } },
          })
        ).toBe(false);
    }
  });
});

describe('direct source cadence encoding', () => {
  it('preserves exact sub-millisecond observations beyond the legacy 24-hour boundary', () => {
    const source = Object.freeze([86400000001, 86400000017, 86400000123, 86400000123]);
    const block = encodeRecordingEventCadence('beyond-one-day', source);
    expect(block).toMatchObject({
      quantumUs: 1,
      count: 4,
      startTimeUs: source[0],
      ticks: [0, 16, 106, 0],
    });
    expect(decodeRecordingEventCadence(block)).toEqual(source);
  });
  it('retains a full bounded chunk at the safe integer boundary', () => {
    const source = Array.from({ length: 512 }, (_, index) => Number.MAX_SAFE_INTEGER - 511 + index);
    expect(
      decodeRecordingEventCadence(encodeRecordingEventCadence('maximum-source-clock', source))
    ).toEqual(source);
  });
  it.each(
    [
      [],
      [-1],
      [1.5],
      [0, -1],
      [2, 1],
      [Infinity],
      [Number.MAX_SAFE_INTEGER + 1],
      Array.from({ length: 513 }, (_, index) => index),
    ].map((source) => ({ source }))
  )('refuses invalid source observations %#', ({ source }) => {
    expect(() => encodeRecordingEventCadence('invalid-source', source)).toThrow();
  });
  it('refuses an invalid identity before producing a block', () => {
    expect(() => encodeRecordingEventCadence('invalid identity', [0])).toThrow();
  });
});

describe('anonymous completed keyboard holds', () => {
  const hold = {
    kind: 'signal',
    recordSeq: 1,
    segmentId: 0,
    activeTimeUs: 9000000,
    signal: {
      id: 'anonymous-hold',
      kind: 'keyboard-hold',
      startTimeUs: 2000000,
      endTimeUs: 3000000,
      point: null,
      data: {
        privacy: 'normal',
        downTimeUs: 2000000,
        upTimeUs: null,
        pressDurationUs: null,
        lastObservedTimeUs: 3000000,
        repeatCount: 70000,
        completion: 'lost',
      },
    },
  };
  it('retains actual last input and exact counts without extending to Stop', () => {
    expect(isRecordingEventRecord(hold)).toBe(true);
    expect(
      isRecordingEventRecord({
        ...hold,
        signal: { ...hold.signal, data: { ...hold.signal.data, downTimeUs: null } },
      })
    ).toBe(true);
  });
  it('admits a real release with unknown onset without inventing duration', () => {
    expect(
      isRecordingEventRecord({
        ...hold,
        signal: {
          ...hold.signal,
          data: {
            ...hold.signal.data,
            downTimeUs: null,
            upTimeUs: 3000000,
            completion: 'released',
          },
        },
      })
    ).toBe(true);
  });
  it('requires exact duration for known edges and closed privacy-safe fields', () => {
    const released = {
      ...hold,
      signal: {
        ...hold.signal,
        data: {
          ...hold.signal.data,
          upTimeUs: 3000000,
          pressDurationUs: 1000000,
          completion: 'released',
        },
      },
    };
    expect(isRecordingEventRecord(released)).toBe(true);
    for (const data of [
      { ...released.signal.data, pressDurationUs: 999999 },
      { ...released.signal.data, downTimeUs: null },
      { ...released.signal.data, key: 'a' },
      { ...released.signal.data, privacy: 'protected' },
      { ...released.signal.data, completion: 'observed' },
      { ...hold.signal.data, upTimeUs: 3000000 },
      { ...hold.signal.data, repeatCount: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(isRecordingEventRecord({ ...released, signal: { ...released.signal, data } })).toBe(
        false
      );
    expect(
      isRecordingEventRecord({ ...hold, signal: { ...hold.signal, point: { x: 0.5, y: 0.5 } } })
    ).toBe(false);
  });
});
