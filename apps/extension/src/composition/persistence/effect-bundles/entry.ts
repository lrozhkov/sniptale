import { z } from 'zod';
import {
  effectLocaleLabelSchema,
  effectLocaleTextSchema,
} from '@sniptale/runtime-contracts/effect-controls';
import {
  parseAnimationTemplateSource,
  ANIMATION_TEMPLATE_LIMITS,
} from '@sniptale/runtime-contracts/animation-template';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { parseStoredEffectPresetPreferences } from '../../../features/video/project/effect-bundle/catalog/presets';
import { EFFECT_BUNDLE_LIMITS } from '../../../features/video/project/effect-bundle';
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type PrototypeAnimationCatalogEntry = Omit<AnimationCatalogEntry, 'version' | 'documents'> & {
  version: 1;
  enabled: boolean;
  documents: Array<
    AnimationCatalogEntry['documents'][number] & {
      enabled: boolean;
      presetPreferences?: import('../../../features/video/project/effect-bundle/catalog/presets').EffectPresetPreferences;
    }
  >;
};
const prototypeAnimationCatalogSchema = z.strictObject({
  format: z.literal('sniptale-animation-catalog'),
  version: z.literal(1),
  packId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/),
  source: z.enum(['lottie-json', 'dotlottie', 'sniptale-animation']),
  sourceSha256: z.string().regex(SHA256),
  label: effectLocaleLabelSchema,
  description: effectLocaleTextSchema.optional(),
  enabled: z.boolean(),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  retainedByteLength: z.number().int().positive().max(EFFECT_BUNDLE_LIMITS.maxInflatedBytes),
  documents: z
    .array(
      z.strictObject({
        id: z.string().regex(IDENTIFIER),
        sha256: z.string().regex(SHA256),
        source: z.string().max(ANIMATION_TEMPLATE_LIMITS.jsonBytes),
        enabled: z.boolean(),
        presetPreferences: z.unknown().optional(),
      })
    )
    .min(1)
    .max(EFFECT_BUNDLE_LIMITS.maxDocuments),
});

/** Structural admission is synchronous; hash and resource verification runs before publication. */
function parsePrototypeAnimationCatalogEntry(
  value: unknown
): PrototypeAnimationCatalogEntry | null {
  const result = prototypeAnimationCatalogSchema.safeParse(value);
  if (!result.success) return null;
  const ids = new Set<string>();
  const documents: PrototypeAnimationCatalogEntry['documents'] = [];
  let measuredBytes = 0;
  for (const entry of result.data.documents) {
    measuredBytes += new TextEncoder().encode(entry.source).byteLength;
    if (measuredBytes > EFFECT_BUNDLE_LIMITS.maxInflatedBytes) return null;
    const parsed = parseAnimationTemplateSource(entry.source);
    if (!parsed.ok || parsed.template.id !== entry.id || ids.has(entry.id)) return null;
    ids.add(entry.id);
    const presetPreferences =
      entry.presetPreferences === undefined
        ? undefined
        : parseStoredEffectPresetPreferences(entry.presetPreferences);
    if (presetPreferences === null) return null;
    if (presetPreferences)
      measuredBytes += new TextEncoder().encode(JSON.stringify(presetPreferences)).byteLength;
    documents.push({
      id: entry.id,
      sha256: entry.sha256,
      source: entry.source,
      enabled: entry.enabled,
      ...(presetPreferences ? { presetPreferences } : {}),
    });
  }
  if (measuredBytes !== result.data.retainedByteLength) return null;
  return { ...result.data, documents };
}

const animationResourceDocumentSchema = z.strictObject({
  id: z.string().regex(IDENTIFIER),
  sha256: z.string().regex(SHA256),
  source: z.string().max(ANIMATION_TEMPLATE_LIMITS.jsonBytes),
});
const animationCatalogSchema = prototypeAnimationCatalogSchema.omit({ enabled: true }).extend({
  version: z.literal(2),
  documents: z.array(animationResourceDocumentSchema).min(1).max(EFFECT_BUNDLE_LIMITS.maxDocuments),
});
/** Archive transport reuses source metadata rules without embedding document bytes in its envelope. */
export const animationCatalogHeaderSchema = animationCatalogSchema.omit({ documents: true });
/** Public resource packets contain no catalog preference authority. */
export function parseAnimationCatalogEntry(value: unknown): AnimationCatalogEntry | null {
  const result = animationCatalogSchema.safeParse(value);
  if (!result.success) return null;
  const ids = new Set<string>();
  let bytes = 0;
  for (const document of result.data.documents) {
    bytes += new TextEncoder().encode(document.source).byteLength;
    if (bytes > EFFECT_BUNDLE_LIMITS.maxInflatedBytes || ids.has(document.id)) return null;
    ids.add(document.id);
    const parsed = parseAnimationTemplateSource(document.source);
    if (!parsed.ok || parsed.template.id !== document.id) return null;
  }
  return bytes === result.data.retainedByteLength ? result.data : null;
}
/** DB55 copied this own prototype metadata atomically; only its unchanged resource bytes remain relevant. */
export function parseStoredAnimationCatalogEntry(value: unknown): AnimationCatalogEntry | null {
  const current = parseAnimationCatalogEntry(value);
  if (current) return current;
  const previous = parsePrototypeAnimationCatalogEntry(value);
  if (!previous) return null;
  const { enabled: _enabled, ...resource } = previous;
  const documents = previous.documents.map(
    ({ enabled: _availability, presetPreferences: _presets, ...document }) => document
  );
  return {
    ...resource,
    version: 2,
    documents,
    retainedByteLength: documents.reduce(
      (sum, document) => sum + new TextEncoder().encode(document.source).byteLength,
      0
    ),
  };
}
