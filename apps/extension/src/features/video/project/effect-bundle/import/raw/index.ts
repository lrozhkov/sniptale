import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { createEffectBundleFailure } from '../../diagnostics';
import { parseBoundedEffectJson } from '../../json-structure';
import type { EffectBundleAssetManifestEntry } from '../../manifest';
import { materializeDocumentAssets } from '../assets';
import { createEffectDocumentFailure } from '../document-failure';
import type { ImportRawEffectDocumentResult } from '../types';

export async function importRawEffectDocument(
  input: Uint8Array
): Promise<ImportRawEffectDocumentResult> {
  let inputDocument: unknown;
  let source: string;
  try {
    inputDocument = parseBoundedEffectJson(input);
    source = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    return createEffectBundleFailure('BUNDLE_DOCUMENT_INVALID', '$document');
  }
  const validation = validateEffectV1Document(inputDocument);
  if (!validation.ok || !validation.document) {
    return createEffectDocumentFailure('$document', validation.diagnostics);
  }
  const usedAssetPaths = new Map<string, EffectBundleAssetManifestEntry>();
  const materialized = await materializeDocumentAssets(
    validation.document,
    [],
    new Map(),
    usedAssetPaths
  );
  if (!materialized.ok) return materialized;
  const sourceSha256 = await sha256EffectV1Bytes(input);
  return {
    artifact: {
      document: {
        assets: materialized.assets,
        document: validation.document,
        sha256: sourceSha256,
        source,
      },
      sourceSha256,
    },
    ok: true,
  };
}
