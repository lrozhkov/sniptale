import { z } from 'zod';
import { MAX_GRADIENT_STOPS, PAINT_INTERPOLATION_SPACES } from '@sniptale/foundation/paint';
const color = z.union([
  z.string().regex(/^#[a-fA-F0-9]{6}$/),
  z.string().regex(/^#[a-fA-F0-9]{8}$/),
]);
const fraction = z.number().finite().min(0).max(1);
const point = z.object({ x: fraction, y: fraction }).strict();
const base = {
  stops: z
    .array(
      z
        .object({
          id: z.string().min(1).max(128),
          color,
          position: fraction,
          midpoint: z.number().finite().min(0.01).max(0.99),
        })
        .strict()
    )
    .min(2)
    .max(MAX_GRADIENT_STOPS)
    .refine((stops) => new Set(stops.map((stop) => stop.id)).size === stops.length),
  interpolation: z.enum(PAINT_INTERPOLATION_SPACES),
  repeat: z.object({ enabled: z.boolean(), span: z.number().finite().min(0.01).max(1) }).strict(),
};
/** Closed paint data keeps both HTML projection and generated model vocabulary bounded. */
export const tourPaintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color }).strict(),
  z
    .object({
      kind: z.literal('gradient'),
      gradient: z.discriminatedUnion('type', [
        z
          .object({
            ...base,
            type: z.literal('linear'),
            angle: z.number().finite().min(0).max(360),
          })
          .strict(),
        z
          .object({
            ...base,
            type: z.literal('radial'),
            center: point,
            radius: z.object({ x: fraction.min(0.01), y: fraction.min(0.01) }).strict(),
          })
          .strict(),
        z
          .object({
            ...base,
            type: z.literal('conic'),
            center: point,
            startAngle: z.number().finite().min(0).max(360),
          })
          .strict(),
      ]),
    })
    .strict(),
]);
