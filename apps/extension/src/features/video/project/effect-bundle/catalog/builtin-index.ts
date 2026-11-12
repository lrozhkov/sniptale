import { z } from 'zod';
import { ANIMATION_TEMPLATE_LIMITS } from '@sniptale/runtime-contracts/animation-template';
import { isCanonicalEffectBundlePath } from '../path';

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u);
const text = z.string().max(4096);
const localized = z.object({ en: text, ru: text }).catchall(text);
const localPath = z.string().max(1024).refine(isCanonicalEffectBundlePath);
const documentEntry = z.strictObject({
  id: identifier,
  path: localPath.refine((value) => value.endsWith('.sniptale-animation.json')),
  byteLength: z.number().int().positive().max(ANIMATION_TEMPLATE_LIMITS.jsonBytes),
  sha256: digest,
});
const noticeEntry = z.strictObject({
  path: localPath.refine((value) => /\.(?:txt|json)$/u.test(value)),
  sha256: digest,
});
const collectionSchema = z
  .strictObject({
    format: z.literal('sniptale-animation-collection'),
    version: z.literal(1),
    id: identifier,
    label: localized,
    description: localized.optional(),
    documents: z.array(documentEntry).min(1).max(128),
    notices: z.array(noticeEntry).max(32),
  })
  .superRefine((value, context) => {
    const paths = [
      'collection.json',
      'index.json',
      ...value.documents.map((entry) => entry.path),
      ...value.notices.map((entry) => entry.path),
    ];
    if (
      new Set(paths.map((path) => path.toLowerCase())).size !== paths.length ||
      new Set(value.documents.map((entry) => entry.id)).size !== value.documents.length ||
      value.documents.reduce((total, entry) => total + entry.byteLength, 0) > 512 * 1024 * 1024
    )
      context.addIssue({
        code: 'custom',
        message: 'Animation collection identities or retained bytes are invalid.',
      });
  });
const tag = z.strictObject({ id: identifier, label: localized });
const presentation = z
  .strictObject({
    label: localized,
    description: localized.optional(),
    duration: z.number().finite().positive().max(ANIMATION_TEMPLATE_LIMITS.durationSeconds),
    defaultControlPresetId: identifier.optional(),
    controlPresets: z
      .array(z.strictObject({ id: identifier, theme: tag, style: tag }))
      .max(64)
      .optional(),
  })
  .superRefine((value, context) => {
    const presets = value.controlPresets ?? [];
    if (
      new Set(presets.map((preset) => preset.id)).size !== presets.length ||
      (value.defaultControlPresetId !== undefined &&
        !presets.some((preset) => preset.id === value.defaultControlPresetId))
    )
      context.addIssue({ code: 'custom', message: 'Animation collection styles are invalid.' });
  });
const indexSchema = z
  .strictObject({
    manifest: collectionSchema,
    sourceSha256: digest,
    documents: z
      .array(z.strictObject({ id: identifier, kind: z.literal('standalone'), presentation }))
      .min(1)
      .max(128),
  })
  .superRefine((value, context) => {
    if (
      value.documents.length !== value.manifest.documents.length ||
      value.documents.some((entry, index) => entry.id !== value.manifest.documents[index]?.id)
    )
      context.addIssue({ code: 'custom', message: 'Animation collection inventory is invalid.' });
  });

type BuiltinAnimationCollection = z.infer<typeof collectionSchema>;
export type BuiltinEffectIndex = z.infer<typeof indexSchema>;

/** Build and runtime admission share exact identities and canonical product-owned file paths. */
export function parseBuiltinAnimationCollection(value: unknown): BuiltinAnimationCollection {
  const result = collectionSchema.safeParse(value);
  if (!result.success) throw new Error('Invalid builtin animation collection');
  return result.data;
}
export function parseBuiltinEffectIndex(value: unknown): BuiltinEffectIndex {
  const result = indexSchema.safeParse(value);
  if (!result.success) throw new Error('Invalid builtin animation index');
  return result.data;
}
