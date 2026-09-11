import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import { readEffectPresentationDocument } from '../presentation-document';

/** Small catalog projection. Rendering and application always require the full validated source. */
export type EffectCatalogPresentation = Pick<
  EffectV1Document,
  'label' | 'description' | 'duration' | 'defaultControlPresetId'
> & {
  controlPresets?: Array<
    Pick<NonNullable<EffectV1Document['controlPresets']>[number], 'id' | 'theme' | 'style'>
  >;
};
export function readCatalogPresentation(entry: {
  source?: string;
  presentation?: EffectCatalogPresentation;
}): EffectCatalogPresentation | undefined {
  return (
    entry.presentation ??
    (entry.source ? readEffectPresentationDocument(entry.source).document : undefined)
  );
}
export function projectCatalogPresentation(document: EffectV1Document): EffectCatalogPresentation {
  return {
    label: document.label,
    ...(document.description ? { description: document.description } : {}),
    duration: document.duration,
    ...(document.defaultControlPresetId
      ? { defaultControlPresetId: document.defaultControlPresetId }
      : {}),
    ...(document.controlPresets
      ? {
          controlPresets: document.controlPresets.map(({ id, theme, style }) => ({
            id,
            theme,
            style,
          })),
        }
      : {}),
  };
}
