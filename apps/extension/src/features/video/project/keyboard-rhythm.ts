import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { RecordingKeyboardRhythmBlock } from './types/interaction';

/** Bounds each decoder and the recording clock without reducing observed cadence. */
export const RECORDING_KEYBOARD_BLOCK_MAX_COUNT = 4096;
const RECORDING_KEYBOARD_MAX_SECONDS = 86400;

/** Encodes one bounded, ordered block on an absolute 1ms grid, avoiding accumulated drift. */
export function encodeRecordingKeyboardRhythm(
  id: string,
  times: readonly number[]
): RecordingKeyboardRhythmBlock {
  if (
    id.trim().length < 1 ||
    id.length > 128 ||
    times.length < 1 ||
    times.length > RECORDING_KEYBOARD_BLOCK_MAX_COUNT
  )
    throw new Error('Invalid keyboard rhythm count');
  const startTime = times[0]!;
  let previousTick = 0;
  let previousTime = startTime;
  const deltas = times.map((time) => {
    if (
      !Number.isFinite(time) ||
      time < 0 ||
      time > RECORDING_KEYBOARD_MAX_SECONDS ||
      time < previousTime
    )
      throw new Error('Invalid keyboard rhythm time');
    const tick = Math.round((time - startTime) * 1000);
    const delta = tick - previousTick;
    previousTick = tick;
    previousTime = time;
    return delta;
  });
  const runs: number[] = [];
  for (const delta of deltas) {
    if (runs.length && runs[runs.length - 2] === delta) runs[runs.length - 1]! += 1;
    else runs.push(delta, 1);
  }
  const encoding = runs.length < deltas.length ? 'rle' : 'delta';
  return {
    version: 1,
    id,
    startTime,
    quantumMs: 1,
    count: times.length,
    encoding,
    ticks: encoding === 'rle' ? runs : deltas,
  };
}

/** Validates before decoding, including count, expansion, byte and source-clock bounds. */
export function isRecordingKeyboardRhythmBlock(
  value: unknown
): value is RecordingKeyboardRhythmBlock {
  if (!isPlainRecord(value)) return false;
  const fields = Object.entries(value);
  const read = (key: string): unknown => value[key];
  const id = read('id');
  const start = read('startTime');
  const count = read('count');
  const ticks = read('ticks');
  const encoding = read('encoding');
  if (
    fields.some(
      ([key]) =>
        !['version', 'id', 'startTime', 'quantumMs', 'count', 'encoding', 'ticks'].includes(key)
    ) ||
    read('version') !== 1 ||
    read('quantumMs') !== 1 ||
    typeof id !== 'string' ||
    id.trim().length < 1 ||
    id.length > 128 ||
    typeof start !== 'number' ||
    !Number.isFinite(start) ||
    start < 0 ||
    start > RECORDING_KEYBOARD_MAX_SECONDS ||
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > RECORDING_KEYBOARD_BLOCK_MAX_COUNT ||
    !isKeyboardTicks(ticks) ||
    ticks.length > RECORDING_KEYBOARD_BLOCK_MAX_COUNT * 2 ||
    (encoding !== 'delta' && encoding !== 'rle') ||
    ticks[0] !== 0
  )
    return false;
  if (encoding === 'delta')
    return (
      ticks.length === count &&
      start + ticks.reduce((sum, tick) => sum + tick, 0) / 1000 <= RECORDING_KEYBOARD_MAX_SECONDS
    );
  if (ticks.length % 2 !== 0) return false;
  let decodedCount = 0;
  let elapsed = 0;
  for (let index = 0; index < ticks.length; index += 2) {
    const run = ticks[index + 1]!;
    if (run < 1 || run > RECORDING_KEYBOARD_BLOCK_MAX_COUNT) return false;
    decodedCount += run;
    elapsed += ticks[index]! * run;
    if (decodedCount > count || start + elapsed / 1000 > RECORDING_KEYBOARD_MAX_SECONDS)
      return false;
  }
  return decodedCount === count;
}

function isKeyboardTicks(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= RECORDING_KEYBOARD_BLOCK_MAX_COUNT * 2 &&
    value.every(
      (tick: unknown) =>
        typeof tick === 'number' &&
        Number.isSafeInteger(tick) &&
        tick >= 0 &&
        tick <= RECORDING_KEYBOARD_MAX_SECONDS * 1000
    )
  );
}

/** Streams a window with stable block/index identity; no expanded schedule is allocated. */
export function* iterateRecordingKeyboardRhythm(
  block: RecordingKeyboardRhythmBlock,
  startTime = 0,
  endTime = RECORDING_KEYBOARD_MAX_SECONDS
): Generator<{ id: string; time: number }> {
  if (!isRecordingKeyboardRhythmBlock(block)) return;
  let tick = 0;
  let attack = 0;
  for (let index = 0; index < block.ticks.length; index += block.encoding === 'delta' ? 1 : 2) {
    const delta = block.ticks[index]!;
    const count = block.encoding === 'delta' ? 1 : block.ticks[index + 1]!;
    for (let repeat = 0; repeat < count; repeat++) {
      tick += delta;
      const time = block.startTime + tick / 1000;
      if (time > endTime) return;
      if (time >= startTime) yield { id: `${block.id}:${attack}`, time };
      attack += 1;
    }
  }
}

/** Bounds the encoded list itself as well as each expanded block before consumers iterate it. */
export function isRecordingKeyboardRhythmBlocks(
  value: unknown
): value is RecordingKeyboardRhythmBlock[] {
  if (!Array.isArray(value) || value.length > 16384) return false;
  let encodedTicks = 0;
  const identities = new Set<string>();
  for (const block of value) {
    if (!isRecordingKeyboardRhythmBlock(block) || identities.has(block.id)) return false;
    identities.add(block.id);
    encodedTicks += block.ticks.length;
    if (encodedTicks > 1048576) return false;
  }
  return true;
}

/** Rejects cadence outside its own captured activity/held interval before any decoder runs. */
export function areRecordingKeyboardRhythmBlocksWithin(
  value: unknown,
  startTime: number,
  endTime: number
): boolean {
  if (
    !isRecordingKeyboardRhythmBlocks(value) ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime < startTime
  )
    return false;
  return value.every((block) => {
    let durationTicks = 0;
    for (let index = 0; index < block.ticks.length; index += block.encoding === 'delta' ? 1 : 2)
      durationTicks +=
        block.ticks[index]! * (block.encoding === 'delta' ? 1 : block.ticks[index + 1]!);
    return (
      block.startTime >= startTime - 0.001 &&
      block.startTime + durationTicks / 1000 <= endTime + 0.001
    );
  });
}
