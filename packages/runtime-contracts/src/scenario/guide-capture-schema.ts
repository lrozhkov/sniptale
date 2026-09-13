import { z } from 'zod';
import { GUIDE_LIMITS } from './limits';
import type { GuideCaptureSource } from './types/image-source';

const coordinate = z
  .number()
  .finite()
  .min(-GUIDE_LIMITS.maxCoordinate)
  .max(GUIDE_LIMITS.maxCoordinate);
const nonNegative = z.number().finite().nonnegative();
const extent = nonNegative.max(GUIDE_LIMITS.maxCoordinate);
const metadataText = z.string().max(GUIDE_LIMITS.maxTextLength).nullable();
const point = z.object({ x: coordinate, y: coordinate }).strict();
const rect = point.extend({ width: extent, height: extent }).strict();

/** Validates source metadata without granting authority to its URLs, selectors or page text. */
export const guideCaptureSourceSchema: z.ZodType<GuideCaptureSource> = z
  .object({
    kind: z.literal('capture'),
    captureSurface: z.enum(['visible', 'full', 'selection']),
    sourceKind: z.enum(['manual', 'auto-click']),
    page: z
      .object({
        title: metadataText,
        url: metadataText,
        viewport: rect,
        scrollX: coordinate,
        scrollY: coordinate,
        devicePixelRatio: z.number().finite().positive().max(100),
      })
      .strict(),
    target: z
      .object({
        selector: metadataText,
        iframeSelector: metadataText,
        tagName: metadataText,
        role: metadataText,
        text: metadataText,
        ariaLabel: metadataText,
        title: metadataText,
        rect: rect.nullable(),
        framePadding: z
          .object({ top: extent, left: extent, right: extent, bottom: extent })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    interactionPoint: point.nullable(),
    cursorPoint: point.nullable(),
    captureMetadata: z
      .object({
        trigger: z.enum(['keyboard-enter', 'pointer-up']),
        pointerRange: z
          .object({
            start: point,
            end: point,
            minX: coordinate,
            minY: coordinate,
            maxX: coordinate,
            maxY: coordinate,
            distance: extent,
            durationMs: nonNegative,
          })
          .strict()
          .nullable(),
        scroll: z
          .object({
            startX: coordinate,
            startY: coordinate,
            endX: coordinate,
            endY: coordinate,
            deltaX: coordinate,
            deltaY: coordinate,
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();
