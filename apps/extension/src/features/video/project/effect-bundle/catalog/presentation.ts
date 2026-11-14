import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { animationRuntimeDuration } from '../../../../../contracts/effect-runtime/animation';
import { readEffectPresentationDocument } from '../presentation-document';

/** Small catalog projection. Rendering and application always require the full validated source. */
export type EffectCatalogPresentation = Pick<
  AnimationTemplate,
  'label' | 'description' | 'defaultControlPresetId'
> & {
  duration: number;
  controlPresets?:
    | Array<
        Pick<NonNullable<AnimationTemplate['controlPresets']>[number], 'id' | 'theme' | 'style'>
      >
    | undefined;
};
export function readCatalogPresentation(entry: {
  source?: string;
  presentation?: EffectCatalogPresentation;
}): EffectCatalogPresentation | undefined {
  if (entry.presentation) return entry.presentation;
  const document = entry.source ? readEffectPresentationDocument(entry.source).document : null;
  return document ? projectCatalogPresentation(document) : undefined;
}
export function projectCatalogPresentation(document: AnimationTemplate): EffectCatalogPresentation {
  return {
    label: document.label,
    ...(document.description ? { description: document.description } : {}),
    duration: animationRuntimeDuration(document),
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
