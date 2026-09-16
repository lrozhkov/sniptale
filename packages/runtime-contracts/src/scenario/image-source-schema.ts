import { z } from 'zod';
import { GUIDE_LIMITS } from './limits';
import { guideCaptureSourceSchema } from './guide-capture-schema';
const id = z
  .string()
  .min(1)
  .max(GUIDE_LIMITS.maxIdLength)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const label = z.string().max(GUIDE_LIMITS.maxLabelLength);
const timestamp = z.number().finite().nonnegative();

/** Shared admission for both stored projects and independent frame imports. */
export const guideVideoActionSchema = z
  .object({
    id,
    kind: z.enum(['CLICK', 'KEY']),
    time: timestamp,
    duration: z.number().finite().min(0).max(10),
    label,
    point: z
      .object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) })
      .strict()
      .nullable(),
    target: z.object({ name: label, tag: label, role: label }).strict().nullable(),
  })
  .strict();

/** A frame may describe only an action active at its captured source timestamp. */
export const guideVideoFrameSourceSchema = z
  .object({
    kind: z.literal('video-frame'),
    recordingId: id.nullable(),
    filename: label,
    timeSeconds: timestamp,
    action: guideVideoActionSchema.optional(),
  })
  .strict()
  .refine(
    (source) =>
      !source.action ||
      (source.recordingId !== null &&
        source.timeSeconds >= source.action.time &&
        source.timeSeconds <= source.action.time + source.action.duration)
  );

/** Shared immutable image provenance admission for both scenario representations. */
export const scenarioImageSourceSchema = z.union([
  guideCaptureSourceSchema,
  z.object({ kind: z.literal('import'), filename: label }).strict(),
  guideVideoFrameSourceSchema,
]);
