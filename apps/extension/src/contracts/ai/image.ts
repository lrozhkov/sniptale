import { isAIConnectionReason, type AIConnectionReason } from '../settings/ai-catalog';
import { z } from 'zod';
import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';
import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { estimateBase64DecodedBytes } from '@sniptale/runtime-contracts/validation/base64';

export const IMAGE_JOB_PORT_NAME = 'sniptale-image-editor-ai';
export const IMAGE_JOB_TIMEOUT_MS = 180_000;
export const IMAGE_JOB_KEEPALIVE_MS = 20_000;
export const IMAGE_JOB_LIMITS = {
  maxImageBytes: 16 * 1024 * 1024,
  maxInputBytes: 20 * 1024 * 1024,
  maxImagePixels: 16_777_216,
  maxImages: 16,
  maxResponseBytes: 32 * 1024 * 1024,
  maxPromptChars: 4_000,
  maxVariants: 3,
} as const;

const id = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value);
const requestId = z.string().uuid();
const imageSide = z.number().int().positive().max(16_384);
const imageDataUrl = z.string().max(Math.ceil(IMAGE_JOB_LIMITS.maxImageBytes / 3) * 4 + 64);

/** Validates encoded raster headers before a receiver allocates a decoded bitmap. */
export const imageRasterSchema = z
  .object({ dataUrl: imageDataUrl, width: imageSide, height: imageSide })
  .strict()
  .superRefine((value, context) => {
    const dimensions = readImageDataUrlDimensions(value.dataUrl, IMAGE_JOB_LIMITS.maxImageBytes);
    if (
      !dimensions ||
      dimensions.width !== value.width ||
      dimensions.height !== value.height ||
      value.width * value.height > IMAGE_JOB_LIMITS.maxImagePixels
    )
      context.addIssue({ code: 'custom', message: 'Invalid or oversized raster image' });
  });
export type ImageRaster = z.infer<typeof imageRasterSchema>;

export const imageParametersSchema = z
  .object({
    variants: z.number().int().min(1).max(IMAGE_JOB_LIMITS.maxVariants),
    aspectRatio: z
      .string()
      .regex(/^\d{1,2}:\d{1,2}$/u)
      .optional(),
    resolution: z.enum(['768', '1K', '1.5K', '2K', '4K']).optional(),
    size: z
      .enum(['256x256', '512x512', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'])
      .optional(),
    quality: z.enum(['low', 'medium', 'high', 'standard', 'hd']).optional(),
    outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
    background: z.enum(['opaque', 'transparent']).optional(),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .strict();
export type ImageParameters = z.infer<typeof imageParametersSchema>;

const inputImageSchema = imageRasterSchema.safeExtend({
  role: z.enum(['source', 'reference']),
});

/** Contains only the frozen material that the user chose to send to the provider. */
export const imageContextSchema = z
  .object({
    version: z.literal(1),
    intention: z.enum(['region', 'source', 'layers', 'new-image']),
    prompt: z
      .string()
      .min(1)
      .max(IMAGE_JOB_LIMITS.maxPromptChars)
      .refine((value) => value.trim().length > 0),
    images: z.array(inputImageSchema).max(IMAGE_JOB_LIMITS.maxImages),
    parameters: imageParametersSchema,
    editRegion: z
      .object({
        left: z.number().int().min(0).max(16_384),
        top: z.number().int().min(0).max(16_384),
        width: imageSide,
        height: imageSide,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const sources = value.images.filter((image) => image.role === 'source').length;
    if ((value.intention !== 'new-image' && sources !== 1) || sources > 1)
      context.addIssue({ code: 'custom', message: 'Choose one frozen source raster' });
    const source = value.images.find((image) => image.role === 'source');
    if (source && value.images[0] !== source)
      context.addIssue({ code: 'custom', message: 'The source image must precede references' });
    const region = value.editRegion;
    if (
      region
        ? !source ||
          region.left + region.width > source.width ||
          region.top + region.height > source.height
        : value.intention === 'region'
    )
      context.addIssue({
        code: 'custom',
        message: 'Choose a valid edit rectangle inside the source image',
      });
    let total = 0;
    for (const image of value.images) {
      total += estimateBase64DecodedBytes(image.dataUrl.slice(image.dataUrl.indexOf(',') + 1));
    }
    if (total > IMAGE_JOB_LIMITS.maxInputBytes)
      context.addIssue({ code: 'custom', message: 'Image attachments exceed the input budget' });
  });
export type ImageContext = z.infer<typeof imageContextSchema>;

/** Local applicability identity; background approves the payload, not the mutable canvas state. */
const imageScopeSchema = z
  .object({ documentId: id, sessionId: requestId, snapshotId: requestId })
  .strict();
export type ImageJobScope = z.infer<typeof imageScopeSchema>;

const startSchema = z
  .object({
    type: z.literal('start'),
    requestId,
    modelId: id,
    approvedProviderId: id,
    approvedDestination: z.string().regex(SHA256_DIGEST_PATTERN),
    approvedModelCode: id,
    llmSessionToken: z.string().min(1).max(512),
    scope: imageScopeSchema,
    context: imageContextSchema,
  })
  .strict();
export type ImageJobStart = z.infer<typeof startSchema>;
const clientSchema = z.discriminatedUnion('type', [
  startSchema,
  z.object({ type: z.literal('cancel'), requestId }).strict(),
  z.object({ type: z.literal('keepalive'), requestId }).strict(),
]);
export type ImageJobClientMessage = z.infer<typeof clientSchema>;

export const IMAGE_JOB_FAILURE_CODES = [
  'invalid-request',
  'unauthorized',
  'stale',
  'model-unavailable',
  'permission-denied',
  'secret-unavailable',
  'cancelled',
  'timeout',
  'provider-failed',
  'invalid-response',
  'too-large',
  'interrupted',
  'network-failed',
] as const;
export type ImageJobFailureCode = (typeof IMAGE_JOB_FAILURE_CODES)[number];

const variant = z
  .number()
  .int()
  .min(0)
  .max(IMAGE_JOB_LIMITS.maxVariants - 1);
const serverSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('progress'),
      requestId,
      phase: z.enum(['authorizing', 'requesting', 'receiving']),
      variant,
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      requestId,
      variant,
      image: imageRasterSchema,
      costRub: z.number().finite().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('complete'),
      requestId,
      received: z.number().int().min(1).max(IMAGE_JOB_LIMITS.maxVariants),
    })
    .strict(),
  z
    .object({
      type: z.literal('failure'),
      requestId,
      code: z.enum(IMAGE_JOB_FAILURE_CODES),
      failureReason: z.custom<AIConnectionReason>(isAIConnectionReason).optional(),
    })
    .strict(),
]);
export type ImageJobServerMessage = z.infer<typeof serverSchema>;

/** Validates every client command at the background port boundary. */
export function parseImageJobClientMessage(value: unknown): ImageJobClientMessage | null {
  const parsed = clientSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Validates received previews without making them part of the editor document. */
export function parseImageJobServerMessage(value: unknown): ImageJobServerMessage | null {
  const parsed = serverSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Input references require editing support even when the intended result is a new image. */
export function getImageContextOperation(
  context: ImageContext
): 'image-generation' | 'image-editing' {
  return context.images.length > 0 ? 'image-editing' : 'image-generation';
}

/** Describes a local crop target without claiming provider-native mask support. */
export function formatImageProviderPrompt(context: ImageContext): string {
  const region = context.editRegion;
  if (!region) return context.prompt;
  return (
    'Edit the first input image. Pixel coordinates start at its top-left corner. ' +
    `Change only the rectangle: left=${region.left}, top=${region.top}, ` +
    `width=${region.width}, height=${region.height}. ` +
    'Keep the input dimensions. Preserve content outside this rectangle. Other input images are references.\n' +
    `User instruction:\n${context.prompt}`
  );
}
