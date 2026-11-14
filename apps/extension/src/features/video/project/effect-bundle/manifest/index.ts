import { z } from 'zod';
import {
  effectLocaleLabelSchema,
  effectLocaleTextSchema,
} from '@sniptale/runtime-contracts/effect-controls';
import { EFFECT_BUNDLE_LIMITS } from '../limits';
import { isCanonicalEffectBundlePath } from '../path';
const animationPackMetadataSchema = z.strictObject({
  packId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/u),
  label: effectLocaleLabelSchema,
  description: effectLocaleTextSchema.optional(),
});
const animationPackManifestSchema = z
  .strictObject({
    format: z.literal('sniptale-animation-pack'),
    version: z.literal(1),
    metadata: animationPackMetadataSchema,
    documents: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u),
          path: z
            .string()
            .max(EFFECT_BUNDLE_LIMITS.maxPathCharacters)
            .refine(
              (value) =>
                isCanonicalEffectBundlePath(value) && value.endsWith('.sniptale-animation.json')
            ),
          byteLength: z.number().int().positive().max(EFFECT_BUNDLE_LIMITS.maxJsonBytes),
          sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        })
      )
      .min(1)
      .max(EFFECT_BUNDLE_LIMITS.maxDocuments),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.documents.map((entry) => entry.id)).size !== value.documents.length ||
      new Set(value.documents.map((entry) => entry.path.toLowerCase())).size !==
        value.documents.length ||
      value.documents.reduce((sum, entry) => sum + entry.byteLength, 0) >
        EFFECT_BUNDLE_LIMITS.maxInflatedBytes
    )
      ctx.addIssue({ code: 'custom', message: 'Animation pack closure is invalid.' });
  });
export type AnimationPackMetadata = z.infer<typeof animationPackMetadataSchema>;
/** Portable packages carry source metadata only, never availability or user preferences. */
export function parseAnimationPackMetadata(value: unknown): AnimationPackMetadata | null {
  const parsed = animationPackMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/** Strict manifest admission precedes document/resource verification and publication. */
export function parseAnimationPackManifest(value: unknown) {
  const parsed = animationPackManifestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
