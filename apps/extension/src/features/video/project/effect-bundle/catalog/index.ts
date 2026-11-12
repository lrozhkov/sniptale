import type { LocaleText } from '@sniptale/runtime-contracts/effect-controls';
import type { EffectCatalogPresentation } from './presentation';
import type { EffectPresetPreferences } from './presets';

export type EffectBundleCatalogSource =
  | 'bundle-zip'
  | 'raw-json'
  | 'builtin'
  | 'lottie-json'
  | 'dotlottie'
  | 'sniptale-animation';

export interface EffectBundleCatalogAssetEntry {
  blob: Blob;
  byteLength: number;
  kind: 'audio' | 'image' | 'svg';
  mimeType: string;
  sha256: string;
}

interface EffectBundleCatalogAssetReference {
  id: string;
  sha256: string;
}

export interface EffectBundleCatalogDocumentEntry {
  /** Resolved catalog availability; never changes applied project instances. */
  enabled?: boolean;
  presetPreferences?: EffectPresetPreferences;
  /** Catalog presentation only, never part of an immutable document or stored entry. */
  previewPresetId?: string;
  assets: EffectBundleCatalogAssetReference[];
  id: string;
  kind: 'standalone';
  schemaVersion: 'sniptale.animation.v1';
  sha256: string;
  source?: string;
  presentation?: EffectCatalogPresentation;
}

export interface EffectBundleCatalogEntry {
  /** Disposable loader for immutable extension resources; never persisted. */
  materializeDocument?: (documentId: string) => Promise<EffectBundleCatalogEntry>;
  assets: EffectBundleCatalogAssetEntry[];
  createdAt: number;
  description: { en: string; ru: string };
  documents: EffectBundleCatalogDocumentEntry[];
  enabled: boolean;
  label: { en: string; ru: string };
  packId: string;
  retainedByteLength: number;
  source: EffectBundleCatalogSource;
  sourceSha256: string;
  updatedAt: number;
  version: string;
}

interface EffectBundleCatalogSummary {
  createdAt: number;
  documentKinds: 'standalone'[];
  enabled: boolean;
  entry: EffectBundleCatalogEntry;
  label: { en: string; ru: string };
  packId: string;
  retainedByteLength: number;
  source: EffectBundleCatalogSource;
  status: 'ready';
  updatedAt: number;
  version: string;
}

interface InvalidEffectBundleCatalogSummary {
  packId: string;
  status: 'invalid';
}

export type EffectBundleCatalogListItem =
  | EffectBundleCatalogSummary
  | InvalidEffectBundleCatalogSummary;

/** Durable animation packages use their own namespace; legacy EffectV1 rows remain opaque. */
export interface AnimationCatalogDocument {
  id: string;
  sha256: string;
  source: string;
}
export interface AnimationCatalogEntry {
  format: 'sniptale-animation-catalog';
  version: 2;
  packId: string;
  source: 'lottie-json' | 'dotlottie' | 'sniptale-animation';
  sourceSha256: string;
  label: LocaleText & { en: string };
  description?: LocaleText | undefined;
  documents: AnimationCatalogDocument[];
  retainedByteLength: number;
  createdAt: number;
  updatedAt: number;
}
