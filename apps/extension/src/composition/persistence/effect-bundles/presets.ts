import {
  parseEffectV1Source,
  validateEffectV1ControlPresetValues,
} from '@sniptale/runtime-contracts/effect-v1';
import { getEffectBundle } from './index';
import { mutateEffectCatalogPreference } from './preferences';
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
  const catalog = await getEffectBundle(packId);
  if (!catalog) throw new Error('Effect catalog changed');
  const verified = await resolveCatalogDocument(catalog, documentId);
  const document = verified.documents.find((item) => item.id === documentId);
  if (!document?.source || document.sha256 !== sourceSha256)
    throw new Error('Effect catalog changed');
  const parsed = parseEffectV1Source(document.source).document;
  const stored = parseStoredEffectPresetPreferences(preferences);
  if (!parsed || !stored) throw new Error('Invalid effect presets');
  await mutateEffectCatalogPreference(packId, (current) => {
    const previous = Object.hasOwn(current.documents, documentId)
      ? current.documents[documentId]
      : document.presetPreferences;
    if (
      JSON.stringify(previous ?? { presets: [] }) !==
      JSON.stringify(expectedPreferences ?? { presets: [] })
    )
      throw new Error('Effect presets changed');
    for (const preset of stored.presets) {
      const old = previous?.presets.find((item) => item.id === preset.id);
      if (
        JSON.stringify(old?.values) !== JSON.stringify(preset.values) &&
        !validateEffectV1ControlPresetValues(parsed, preset.values).ok
      )
        throw new Error('Invalid effect presets');
    }
    const choice = stored.defaultPreset;
    if (choice && JSON.stringify(choice) !== JSON.stringify(previous?.defaultPreset)) {
      const preset =
        choice.kind === 'builtin'
          ? parsed.controlPresets?.find((item) => item.id === choice.id)
          : stored.presets.find((item) => item.id === choice.id);
      if (!preset || !validateEffectV1ControlPresetValues(parsed, preset.values).ok)
        throw new Error('Unavailable effect preset');
    }
    return { ...current, documents: { ...current.documents, [documentId]: preferences } };
  });
  return (await getEffectBundle(packId))!;
}
