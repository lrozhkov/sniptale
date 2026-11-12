import { z } from 'zod';
import { parseAudioProcessing } from './validation';
import type { AudioProcessing } from './types';

export const AUDIO_WORKLET_SAMPLE_RATE = 48_000;
export const AUDIO_WORKLET_SOURCE_PAGE_FRAMES = 48_000;
export const AUDIO_WORKLET_OUTPUT_CHUNK_FRAMES = 4_800;
export const AUDIO_WORKLET_OUTPUT_QUEUE_CHUNKS = 4;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const frame = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identity = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const planes = z
  .array(
    z
      .instanceof(Float32Array)
      .refine(
        (plane) =>
          plane.buffer instanceof ArrayBuffer &&
          plane.length > 0 &&
          plane.length <= AUDIO_WORKLET_SOURCE_PAGE_FRAMES &&
          plane.every(Number.isFinite)
      )
  )
  .min(1)
  .max(2)
  .refine((value) => value.every((plane) => plane.length === value[0]!.length));
const assetPath = z
  .string()
  .regex(
    /^audio-effects\/(?:rnnoise|faust\/(?:eq|highpass|lowpass|compressor|limiter|delay|reverb|saturation))\.wasm$/u
  );
const assets = z
  .record(
    assetPath,
    z
      .instanceof(Uint8Array)
      .refine(
        (bytes) =>
          bytes.buffer instanceof ArrayBuffer &&
          bytes.byteLength > 0 &&
          bytes.byteLength <= MAX_ASSET_BYTES
      )
  )
  .refine(
    (value) =>
      Object.keys(value).length <= 9 &&
      Object.values(value).reduce((sum, bytes) => sum + bytes.byteLength, 0) <= MAX_ASSET_BYTES
  );
const processing = z
  .custom<AudioProcessing>((value) => parseAudioProcessing(value) !== null)
  .transform((value) => parseAudioProcessing(value)!);
const hostMessage = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('initialize'),
    generation: identity,
    channels: z.union([z.literal(1), z.literal(2)]),
    sourceLengthFrames: frame,
    durationFrames: frame,
    rate: z
      .number()
      .finite()
      .min(1 / 16)
      .max(16),
    processing,
    assets,
  }),
  z.strictObject({
    kind: z.literal('source-reply'),
    generation: identity,
    requestId: identity,
    planes,
  }),
  z.strictObject({ kind: z.literal('source-error'), generation: identity, requestId: identity }),
  z.strictObject({ kind: z.literal('prime'), generation: identity, startFrame: frame }),
  z
    .strictObject({
      kind: z.literal('play'),
      generation: identity,
      whenFrame: frame,
      startFrame: frame,
      endFrame: frame,
    })
    .refine((value) => value.endFrame > value.startFrame),
  z.strictObject({ kind: z.literal('dispose'), generation: identity }),
]);
const processorMessage = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready'), generation: identity }),
  z.strictObject({
    kind: z.literal('primed'),
    generation: identity,
    startFrame: frame,
    bufferedFrames: frame.max(
      AUDIO_WORKLET_OUTPUT_QUEUE_CHUNKS * AUDIO_WORKLET_OUTPUT_CHUNK_FRAMES
    ),
  }),
  z
    .strictObject({
      kind: z.literal('source-read'),
      generation: identity,
      requestId: identity,
      startFrame: frame,
      endFrame: frame,
    })
    .refine(
      (value) =>
        value.endFrame > value.startFrame &&
        value.endFrame - value.startFrame <= AUDIO_WORKLET_SOURCE_PAGE_FRAMES
    ),
  z.strictObject({ kind: z.literal('underrun'), generation: identity, frame }),
  z.strictObject({ kind: z.literal('ended'), generation: identity }),
  z.strictObject({
    kind: z.literal('failed'),
    generation: identity,
    reason: z.enum(['protocol', 'prepare', 'source', 'render']),
  }),
]);
export type AudioWorkletHostMessage = z.infer<typeof hostMessage>;
export type AudioWorkletProcessorMessage = z.infer<typeof processorMessage>;

/** Admits only the fixed processing protocol. Callers retain transferred PCM ownership. */
export function parseAudioWorkletHostMessage(value: unknown): AudioWorkletHostMessage | null {
  const result = hostMessage.safeParse(value);
  return result.success ? result.data : null;
}
/** Request IDs and generations are checked against the receiving placement after admission. */
export function parseAudioWorkletProcessorMessage(
  value: unknown
): AudioWorkletProcessorMessage | null {
  const result = processorMessage.safeParse(value);
  return result.success ? result.data : null;
}
