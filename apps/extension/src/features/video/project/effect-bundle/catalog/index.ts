import type { EffectV1Kind } from '@sniptale/runtime-contracts/effect-v1';

export type EffectBundleCatalogSource = 'bundle-zip' | 'raw-json';

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
  assets: EffectBundleCatalogAssetReference[];
  id: string;
  kind: EffectV1Kind;
  schemaVersion: 'sniptale.effect.v1';
  sha256: string;
  source: string;
}

export interface EffectBundleCatalogEntry {
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
  documentKinds: EffectV1Kind[];
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
