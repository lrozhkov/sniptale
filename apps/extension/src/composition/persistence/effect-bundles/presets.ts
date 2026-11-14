import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { validateEffectControlPresetValues } from '@sniptale/runtime-contracts/effect-controls';
import { getEffectBundle } from './index';
import { mutateVisualCatalogPreference, runVisualCatalogMutation } from './preferences';
import { resolveCatalogDocument } from '../../../features/video/project/effect-bundle/catalog/resolution';
import {
  parseStoredEffectPresetPreferences,
  type EffectPresetPreferences,
} from '../../../features/video/project/effect-bundle/catalog/presets';

export async function saveEffectPresetPreferences(
  packId: string,
  documentId: string,
  sourceSha256: string,
  preferences: EffectPresetPreferences,
  expectedPreferences?: EffectPresetPreferences
) {
  return runVisualCatalogMutation(async (permit) => {
    const catalog = await getEffectBundle(packId, permit);
    if (!catalog) throw new Error('Effect catalog changed');
    const verified = await resolveCatalogDocument(catalog, documentId);
    const document = verified.documents.find((item) => item.id === documentId);
    if (!document?.source || document.sha256 !== sourceSha256)
      throw new Error('Effect catalog changed');
    const parsed = parseAnimationTemplateSource(document.source).template;
    const stored = parseStoredEffectPresetPreferences(preferences);
    if (!parsed || !stored) throw new Error('Invalid effect presets');
    await mutateVisualCatalogPreference(
      'animation',
      packId,
      (current) => {
        const reference = current?.documents[documentId];
        if (reference && reference.sourceSha256 !== sourceSha256)
          throw new Error('Effect catalog changed');
        const previous = reference?.presetPreferences;
        if (
          JSON.stringify(previous ?? { presets: [] }) !==
          JSON.stringify(expectedPreferences ?? { presets: [] })
        )
          throw new Error('Effect presets changed');
        for (const preset of stored.presets) {
          const old = previous?.presets.find((item) => item.id === preset.id);
          if (
            JSON.stringify(old?.values) !== JSON.stringify(preset.values) &&
            !validateEffectControlPresetValues(parsed, preset.values).ok
          )
            throw new Error('Invalid effect presets');
        }
        const choice = stored.defaultPreset;
        if (choice && JSON.stringify(choice) !== JSON.stringify(previous?.defaultPreset)) {
          const preset =
            choice.kind === 'builtin'
              ? parsed.controlPresets?.find((item) => item.id === choice.id)
              : stored.presets.find((item) => item.id === choice.id);
          if (!preset || !validateEffectControlPresetValues(parsed, preset.values).ok)
            throw new Error('Unavailable effect preset');
        }
        return {
          ...current,
          format: 'sniptale-visual-preferences',
          version: 1,
          kind: 'animation',
          packId,
          documents: {
            ...current?.documents,
            [documentId]: { ...reference, sourceSha256, presetPreferences: stored },
          },
        };
      },
      permit
    );
    return (await getEffectBundle(packId, permit))!;
  });
}
