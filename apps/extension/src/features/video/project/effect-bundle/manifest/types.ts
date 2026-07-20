/** Canonical engine2 bundle manifest data contracts. */
export const EFFECT_ASSET_MIME_BY_KIND = {
  audio: new Set(['audio/mpeg', 'audio/ogg', 'audio/wav']),
  image: new Set(['image/jpeg', 'image/png', 'image/webp']),
  svg: new Set(['image/svg+xml']),
} as const;

export interface EffectBundleDocumentManifestEntry {
  byteLength: number;
  id: string;
  path: string;
  schemaVersion: 'sniptale.effect.v1';
  sha256: string;
}

export type EffectBundleAssetKind = keyof typeof EFFECT_ASSET_MIME_BY_KIND;

export interface EffectBundleAssetManifestEntry {
  byteLength: number;
  kind: EffectBundleAssetKind;
  mimeType: string;
  path: string;
  sha256: string;
}

export interface EffectBundleLocalizedText {
  en: string;
  ru: string;
}

export interface EffectBundleManifest {
  assets: EffectBundleAssetManifestEntry[];
  description?: EffectBundleLocalizedText;
  effectDocuments: EffectBundleDocumentManifestEntry[];
  engineVersion: '2.0';
  label: EffectBundleLocalizedText;
  manifestVersion: 'sniptale.bundle.v1';
  packId: string;
  version: string;
}
