import { parseEffectBundleManifest, type EffectBundleManifest } from '../manifest';
import type { EffectV1Kind } from '@sniptale/runtime-contracts/effect-v1';
import type { EffectCatalogPresentation } from './presentation';

export interface BuiltinEffectIndex {
  manifest: EffectBundleManifest;
  sourceSha256: string;
  documents: Array<{ id: string; kind: EffectV1Kind; presentation: EffectCatalogPresentation }>;
}
export function parseBuiltinEffectIndex(input: unknown): BuiltinEffectIndex {
  if (
    !record(input) ||
    typeof input['sourceSha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input['sourceSha256'])
  )
    throw new Error('Invalid builtin index');
  const parsed = parseEffectBundleManifest(input['manifest']);
  if (
    !parsed.ok ||
    !Array.isArray(input['documents']) ||
    input['documents'].length !== parsed.manifest.effectDocuments.length
  )
    throw new Error('Invalid builtin inventory');
  const documents = input['documents'].map(
    (entry, index): BuiltinEffectIndex['documents'][number] => {
      if (
        !record(entry) ||
        entry['id'] !== parsed.manifest.effectDocuments[index]?.id ||
        (entry['kind'] !== 'standalone' &&
          entry['kind'] !== 'targetEffect' &&
          entry['kind'] !== 'transition')
      )
        throw new Error('Invalid builtin document');
      const p = entry['presentation'];
      if (
        !record(p) ||
        !localized(p['label']) ||
        typeof p['duration'] !== 'number' ||
        !Number.isFinite(p['duration']) ||
        p['duration'] <= 0 ||
        p['duration'] > 3600 ||
        (p['description'] !== undefined && !localized(p['description']))
      )
        throw new Error('Invalid builtin presentation');
      const presets = p['controlPresets'];
      if (presets !== undefined && (!Array.isArray(presets) || presets.length > 64))
        throw new Error('Invalid builtin styles');
      const styles = Array.isArray(presets)
        ? presets.map((value) => {
            if (
              !record(value) ||
              !identifier(value['id']) ||
              !tag(value['theme']) ||
              !tag(value['style'])
            )
              throw new Error('Invalid builtin style');
            return { id: value['id'], theme: value['theme'], style: value['style'] };
          })
        : undefined;
      const defaultId = p['defaultControlPresetId'];
      if (
        defaultId !== undefined &&
        (!identifier(defaultId) || !styles?.some((s) => s.id === defaultId))
      )
        throw new Error('Invalid builtin default');
      return {
        id: parsed.manifest.effectDocuments[index]!.id,
        kind: entry['kind'],
        presentation: {
          label: p['label'],
          duration: p['duration'],
          ...(localized(p['description']) ? { description: p['description'] } : {}),
          ...(styles ? { controlPresets: styles } : {}),
          ...(typeof defaultId === 'string' ? { defaultControlPresetId: defaultId } : {}),
        },
      };
    }
  );
  return { manifest: parsed.manifest, sourceSha256: input['sourceSha256'], documents };
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function identifier(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
}
function localized(v: unknown): v is { en: string; [key: string]: string } {
  return (
    record(v) &&
    typeof v['en'] === 'string' &&
    Object.values(v).every((x) => typeof x === 'string' && x.length <= 4096)
  );
}
function tag(v: unknown): v is { id: string; label: { en: string; [key: string]: string } } {
  return record(v) && identifier(v['id']) && localized(v['label']);
}
