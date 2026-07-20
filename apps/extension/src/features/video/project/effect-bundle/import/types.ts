import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import type { EffectBundleFailure } from '../diagnostics';
import type { ImportedEffectAsset } from './assets';
import type { EffectBundleManifest } from '../manifest';

export type { ImportedEffectAsset } from './assets';

export interface ImportedEffectDocument {
  assets: ImportedEffectAsset[];
  document: EffectV1Document;
  sha256: string;
  source: string;
}

export interface ImportedEffectBundle {
  archiveSha256: string;
  documents: ImportedEffectDocument[];
  manifest: EffectBundleManifest;
}

export type ImportEffectBundleZipResult =
  | { bundle: ImportedEffectBundle; ok: true }
  | EffectBundleFailure;

export interface ImportedRawEffectDocument {
  document: ImportedEffectDocument;
  sourceSha256: string;
}

export type ImportRawEffectDocumentResult =
  | { artifact: ImportedRawEffectDocument; ok: true }
  | EffectBundleFailure;
