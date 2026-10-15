import { ACTION_SOUND_CATALOG, type ActionSoundSampleId } from './action-audio-catalog';
import type { ReviewActionAudioPreset, ReviewActionAudioRef } from './advanced/action-audio';

const RATE = 44100;
const BLOCK_FRAMES = RATE * 2;
const MIN_GAP = Math.ceil(RATE / 12);
const MIN_BLOCK_LEAD = Math.round(RATE * 0.04);
const LAST_ATTACK = BLOCK_FRAMES + MIN_BLOCK_LEAD - MIN_GAP;
const keys = ['key-01-v1', 'key-02-v1', 'key-03-v1', 'key-04-v1'] as const;
const maximumTail = Math.max(...keys.map((id) => ACTION_SOUND_CATALOG[id].durationFrames));

interface ActionTypingEvent {
  /** Block/event identity is independent of query order, seek and output offsets. */
  id: string;
  startFrame: number;
  durationFrames: number;
  sampleId: ActionSoundSampleId;
  gain: number;
}

/** v1: UTF8 FNV-1a (2166136261/16777619) over JSON[1,kind,id,preset,source-span]. */
export function actionAudioSeed(
  ref: ReviewActionAudioRef,
  preset: ReviewActionAudioPreset,
  sourceSpan: string
): number {
  const bytes = new TextEncoder().encode(JSON.stringify([1, ref.kind, ref.id, preset, sourceSpan]));
  let value = 2166136261;
  for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
  return value;
}

/** Frozen v1 counter avalanche; no random state survives a block query. */
function counter(seed: number, block: number, index: number): number {
  let value = seed ^ Math.imul(block + 1, 0x9e3779b9) ^ Math.imul(index + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
const unit = (value: number) => value / 0x1_0000_0000;

/** At most sixteen original-rate key attacks per indexed block; seams obey the same 12 Hz cap. */
export function actionTypingBlock(seed: number, block: number): ActionTypingEvent[] {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffff_ffff ||
    !Number.isSafeInteger(block) ||
    block < 0 ||
    block > Math.floor(Number.MAX_SAFE_INTEGER / BLOCK_FRAMES)
  )
    throw new Error('Action typing block is invalid.');
  const result: ActionTypingEvent[] = [];
  let frame =
    block === 0 ? 0 : MIN_BLOCK_LEAD + Math.floor(unit(counter(seed, block, 63)) * RATE * 0.08);
  for (let index = 0; index < 16 && frame <= LAST_ATTACK; index++) {
    const sampleId = keys[counter(seed, block, index * 4) % keys.length]!;
    result.push({
      id: `${block}:${index}`,
      startFrame: block * BLOCK_FRAMES + frame,
      durationFrames: ACTION_SOUND_CATALOG[sampleId].durationFrames,
      sampleId,
      gain: Math.round((0.85 + unit(counter(seed, block, index * 4 + 1)) * 0.3) * 1e6) / 1e6,
    });
    frame += Math.round((0.14 + unit(counter(seed, block, index * 4 + 2)) * 0.06) * RATE);
    const pause = counter(seed, block, index * 4 + 3);
    if (index % 4 === 3 && pause % 3 === 0) frame += Math.round((0.15 + unit(pause) * 0.2) * RATE);
  }
  return result;
}

/** Random access visits only intersecting two-second blocks plus native tails; it retains no timeline. */
export function* iterateActionTypingWindow(
  seed: number,
  start: number,
  end: number
): Generator<ActionTypingEvent> {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    Math.abs(start) > Number.MAX_SAFE_INTEGER / RATE ||
    Math.abs(end) > Number.MAX_SAFE_INTEGER / RATE
  )
    throw new Error('Action typing window is invalid.');
  if (end <= start || end <= 0) return;
  const from = Math.max(0, Math.floor((start * RATE - maximumTail) / BLOCK_FRAMES));
  const to = Math.ceil((end * RATE) / BLOCK_FRAMES);
  for (let block = from; block < to; block++) {
    for (const event of actionTypingBlock(seed, block)) {
      if (event.startFrame < end * RATE && event.startFrame + event.durationFrames > start * RATE)
        yield event;
    }
  }
}
