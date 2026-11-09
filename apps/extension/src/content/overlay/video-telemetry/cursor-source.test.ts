import { describe, expect, it, vi } from 'vitest';
import { createCursorObservationSource, type CursorSourceMoment } from './cursor-source';
import {
  isRecordingCursorObservationPacket,
  type RecordingCursorObservationPacket,
} from '../../../contracts/video/cursor-observations';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function moment(n: number, phase = 'phase-0'): CursorSourceMoment {
  return {
    sourceClockId: phase,
    observationTimeSeconds: n / 1000,
    viewport: {
      width: 1920,
      height: 1080,
      devicePixelRatio: 1,
      visualViewportScale: 1,
      visualViewportOffsetX: 0,
      visualViewportOffsetY: 0,
    },
  };
}
const point = {
  x: 12,
  y: 14,
  observed: true,
  visible: true,
  event: 'move' as const,
  button: 'none' as const,
  relatedLocalSequence: null,
};
function setup(send?: (packet: RecordingCursorObservationPacket) => Promise<void>) {
  const packets: RecordingCursorObservationPacket[] = [];
  const source = createCursorObservationSource({
    recordingId: 'recording-1',
    project: (input) => ({
      activeTimeUs: Math.round(input.observationTimeSeconds * 1_000_000),
      clockRevision: 0,
      clock: {
        source: 'dom-event-time',
        timestampQuantumUs: null,
        resolutionBoundUs: null,
        mappingUncertaintyUs: null,
      },
    }),
    send:
      send ??
      (async (packet) => {
        packets.push(packet);
      }),
  });
  return { source, packets };
}

describe('bounded browser cursor source', () => {
  it('streams more than 4096 observations without a lifetime cap or fixed-rate filter', async () => {
    const { source, packets } = setup();
    for (let chunk = 0; chunk < 100; chunk++) {
      for (let i = 0; i < 100; i++) source.sample(moment(chunk * 100 + i), point);
      expect(await source.flush()).toBe(true);
    }
    expect(packets.flatMap((packet) => packet.records)).toHaveLength(10000);
    expect(packets.every(isRecordingCursorObservationPacket)).toBe(true);
    expect(packets.every((packet, i) => packet.batchSequence === i)).toBe(true);
    expect(source.pendingCount).toBe(0);
  });
  it('bounds the pending queue and sends an explicit loss range before Stop', async () => {
    const gate = deferred();
    const { source, packets } = setup();
    source.waitForCalibration(gate.promise);
    for (let i = 0; i < 10000; i++) source.sample(moment(i), point);
    source.boundary(moment(10000), 'stop');
    expect(source.pendingCount).toBe(512);
    gate.resolve();
    expect(await source.flush()).toBe(true);
    const records = packets.flatMap((packet) => packet.records);
    expect(records.filter((record) => record.kind === 'sample')).toHaveLength(512);
    expect(records.at(-2)).toEqual({
      kind: 'gap',
      reason: 'input-overflow',
      fromTimeUs: 512000,
      toTimeUs: 10000000,
      firstLostLocalSequence: 512,
      lastLostLocalSequence: 9999,
    });
    expect(records.at(-1)).toEqual({ kind: 'boundary', activeTimeUs: 10000000, reason: 'stop' });
  });
  it('retries identical bytes and sequence after a transport refusal', async () => {
    const attempts: RecordingCursorObservationPacket[] = [];
    const send = vi.fn(async (packet: RecordingCursorObservationPacket) => {
      attempts.push(structuredClone(packet));
      if (attempts.length === 1) {
        packet.records.length = 0;
        throw new Error('refused');
      }
    });
    const { source } = setup(send);
    source.sample(moment(42), point);
    expect(await source.flush()).toBe(false);
    expect(await source.flush()).toBe(true);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('keeps source event time and applies calibration before the first drain', async () => {
    const gate = deferred();
    let offset = 0;
    const packets: RecordingCursorObservationPacket[] = [];
    const source = createCursorObservationSource({
      recordingId: 'recording-1',
      project: (input) => ({
        activeTimeUs: Math.round(input.observationTimeSeconds * 1_000_000) + offset,
        clockRevision: 7,
        clock: {
          source: 'dom-event-time',
          timestampQuantumUs: null,
          resolutionBoundUs: null,
          mappingUncertaintyUs: 400,
        },
      }),
      send: async (packet) => {
        packets.push(packet);
      },
    });
    source.waitForCalibration(gate.promise);
    source.sample(moment(15), point);
    source.sample(moment(25), point);
    expect(packets).toHaveLength(0);
    offset = 2000;
    gate.resolve();
    expect(await source.flush()).toBe(true);
    expect(packets[0]?.records).toMatchObject([{ activeTimeUs: 17000 }, { activeTimeUs: 27000 }]);
  });
  it('separates packets by phase and viewport and snapshots input coordinates', async () => {
    const { source, packets } = setup();
    const input = moment(1);
    const viewport = { ...input.viewport };
    input.viewport = viewport;
    source.sample(input, point);
    viewport.width = 1280;
    source.sample(input, point);
    source.sample(moment(2, 'phase-1'), point);
    await source.flush();
    expect(packets).toHaveLength(3);
    expect(packets.map((packet) => [packet.sourceClockId, packet.viewport.width])).toEqual([
      ['phase-0', 1920],
      ['phase-0', 1280],
      ['phase-1', 1920],
    ]);
  });
  it('keeps one in-flight packet and refuses new input after close while draining accepted input', async () => {
    const gate = deferred();
    const packets: RecordingCursorObservationPacket[] = [];
    let active = 0;
    let maximum = 0;
    const { source } = setup(async (packet) => {
      maximum = Math.max(maximum, ++active);
      packets.push(packet);
      if (packets.length === 1) await gate.promise;
      active--;
    });
    source.sample(moment(1), point);
    await Promise.resolve();
    for (let i = 2; i < 100; i++) source.sample(moment(i), point);
    source.close();
    source.sample(moment(100), point);
    gate.resolve();
    expect(await source.flush()).toBe(true);
    expect(maximum).toBe(1);
    expect(packets.flatMap((packet) => packet.records)).toHaveLength(99);
  });
});
