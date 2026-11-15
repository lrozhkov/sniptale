import { z } from 'zod';
import { ANIMATION_TEMPLATE_LIMITS } from '@sniptale/runtime-contracts/animation-template';
import type { AnimationCatalogEntry } from '../../../../features/video/project/effect-bundle/catalog';
import {
  parseVisualCatalogPreference,
  type VisualCatalogPreference,
} from '../../../../features/video/project/effect-bundle/catalog/presets';
import { EFFECT_BUNDLE_LIMITS } from '../../../../features/video/project/effect-bundle/limits';
import { animationCatalogHeaderSchema } from '../../../../composition/persistence/effect-bundles/entry';
import {
  glPresetCatalogHeaderSchema,
  type GlPresetCatalogEntry,
} from '../../../../composition/persistence/effect-bundles/gl-presets';
const objectId = z.string().min(1).max(512);
const document = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive().max(ANIMATION_TEMPLATE_LIMITS.jsonBytes),
  objectId,
});
const common = {
  format: z.literal('sniptale-visual-catalog-root'),
  version: z.literal(1),
  preferenceSource: z
    .string()
    .max(1024 * 1024)
    .optional(),
};
const schema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('animation'),
    entry: animationCatalogHeaderSchema.extend({
      documents: z.array(document).min(1).max(EFFECT_BUNDLE_LIMITS.maxDocuments),
    }),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('transition'),
    entry: glPresetCatalogHeaderSchema.extend({ sourceObjectId: objectId }),
  }),
]);
// Keep the discriminated entry relationship after replacing an unknown transport field.
export type PortableVisualCatalogMetadata =
  | {
      format: 'sniptale-visual-catalog-root';
      version: 1;
      kind: 'animation';
      entry: z.infer<typeof animationCatalogHeaderSchema> & {
        documents: z.infer<typeof document>[];
      };
      preference?: VisualCatalogPreference;
    }
  | {
      format: 'sniptale-visual-catalog-root';
      version: 1;
      kind: 'transition';
      entry: z.infer<typeof glPresetCatalogHeaderSchema> & { sourceObjectId: string };
      preference?: VisualCatalogPreference;
    };
export function visualCatalogMetadataRootId(metadata: PortableVisualCatalogMetadata): string {
  return metadata.kind === 'animation'
    ? `animation:${metadata.entry.packId}`
    : `transition:${metadata.entry.id}`;
}
export function parseEffectBundleMetadata(value: unknown): PortableVisualCatalogMetadata {
  const parsed = schema.parse(value),
    { preferenceSource: raw, ...resource } = parsed;
  const id = resource.kind === 'animation' ? resource.entry.packId : resource.entry.id;
  if (resource.kind === 'animation') {
    const docs = resource.entry.documents;
    if (
      new Set(docs.map((doc) => doc.id)).size !== docs.length ||
      new Set(docs.map((doc) => doc.objectId)).size !== docs.length ||
      docs.reduce((sum, doc) => sum + doc.byteLength, 0) !== resource.entry.retainedByteLength
    )
      throw Error('Animation archive document inventory is invalid.');
  } else if (resource.entry.id !== `gl.${resource.entry.sourceSha256}`)
    throw Error('GL archive identity does not match its source.');
  if (raw === undefined) return resource;
  if (new TextEncoder().encode(raw).byteLength > 1024 * 1024)
    throw Error('Visual archive preference exceeds its resource profile.');
  const preference = parseVisualCatalogPreference(JSON.parse(raw));
  if (!preference || preference.kind !== resource.kind || preference.packId !== id)
    throw Error('Visual archive preference identity is invalid.');
  return { ...resource, preference };
}
export function encodeEffectBundleMetadata(args: {
  entry: AnimationCatalogEntry | GlPresetCatalogEntry;
  objectIds: readonly string[];
  preference?: VisualCatalogPreference;
}): z.infer<typeof schema> {
  const { entry, objectIds, preference } = args;
  if (entry.format === 'sniptale-animation-catalog') {
    if (objectIds.length !== entry.documents.length)
      throw Error('Animation portable object inventory is incomplete.');
    const encoded = schema.parse({
      format: 'sniptale-visual-catalog-root',
      version: 1,
      kind: 'animation',
      entry: {
        ...entry,
        documents: entry.documents.map((doc, index) => ({
          id: doc.id,
          sha256: doc.sha256,
          byteLength: new TextEncoder().encode(doc.source).byteLength,
          objectId: objectIds[index],
        })),
      },
      ...(preference ? { preferenceSource: JSON.stringify(preference) } : {}),
    });
    parseEffectBundleMetadata(encoded);
    return encoded;
  }
  if (objectIds.length !== 1) throw Error('GL portable object inventory is incomplete.');
  const { source: _source, ...header } = entry;
  const encoded = schema.parse({
    format: 'sniptale-visual-catalog-root',
    version: 1,
    kind: 'transition',
    entry: { ...header, sourceObjectId: objectIds[0] },
    ...(preference ? { preferenceSource: JSON.stringify(preference) } : {}),
  });
  parseEffectBundleMetadata(encoded);
  return encoded;
}
