import { readFileSync } from 'node:fs';

/**
 * Shared proof owner for the authoritative SDK bundle corpus.
 *
 * The archive bytes stay beside the importer that owns their production contract,
 * while tests outside that owner consume only this locked, read-only proof surface.
 */
export interface EffectBundleCorpusCase {
  accepted: boolean;
  archiveBytes: number;
  archiveSha256: string;
  artifact: string;
  effectKinds?: string[];
  primaryCode?: string;
}

export const EFFECT_BUNDLE_CORPUS_LOCK = {
  corpusVersion: '0.1.0',
  effectSdkCommit: '366f7036ac924b50ed586bfd67d95bd9ebf6d30c',
  formatVersion: 'sniptale.bundle-corpus.v1',
} as const;

export const EFFECT_BUNDLE_CORPUS: EffectBundleCorpusCase[] = [
  {
    accepted: false,
    archiveBytes: 1593,
    archiveSha256: '16eab85928b69cfeca7f32686ce1697d4c349f23c83891927ea594814075bdca',
    artifact: 'invalid/asset-mime-mismatch.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ASSET_MIME_MISMATCH',
  },
  {
    accepted: false,
    archiveBytes: 1077,
    archiveSha256: 'd16fd38fd78eca66d6af2a49a49576c880d3ea0213c8f7637b145cc5cda6a29f',
    artifact: 'invalid/forbidden-executable.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_EXECUTABLE_ENTRY_FORBIDDEN',
  },
  {
    accepted: false,
    archiveBytes: 913,
    archiveSha256: '0ee4cd9db3e56ca559c5ec41ed4221794690b552b8e41f180aad11a75281d22c',
    artifact: 'invalid/hash-mismatch.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ENTRY_HASH_MISMATCH',
  },
  {
    accepted: false,
    archiveBytes: 456,
    archiveSha256: 'ef9136a401eb0fec727afece6e1489039dd7a1294ca6dfd470186b6b575fe40e',
    artifact: 'invalid/missing-document.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ENTRY_MISSING',
  },
  {
    accepted: false,
    archiveBytes: 958,
    archiveSha256: 'b07af3a6d4761e3d459499e7ad777eb5f0540f9448de8f2572f4c66c6a133012',
    artifact: 'invalid/size-mismatch.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ENTRY_SIZE_MISMATCH',
  },
  {
    accepted: false,
    archiveBytes: 1065,
    archiveSha256: 'c7c4df6fa14e483f7c2ec6f3c8cb5e1e388eafec1a300a5b74c10da858668eed',
    artifact: 'invalid/undeclared-entry.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ENTRY_UNDECLARED',
  },
  {
    accepted: false,
    archiveBytes: 959,
    archiveSha256: '5d962b775cbbfb1be7e2bdb54ea32d171058f1db2b2605bc68459639b0c6251d',
    artifact: 'invalid/unsafe-manifest-path.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ENTRY_PATH_UNSAFE',
  },
  {
    accepted: false,
    archiveBytes: 990,
    archiveSha256: '2ab119e4912c6d90b9fd6906dc43ef2cc6501addbbe454190e17534607f7695a',
    artifact: 'invalid/wrapper-directory.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_MANIFEST_MISSING',
  },
  {
    accepted: false,
    archiveBytes: 957,
    archiveSha256: '20be365ed5e881a376f23cee65f8d3bb40277423523d48fb2deb52fcad10e79c',
    artifact: 'invalid/wrong-engine.sniptale-bundle.zip',
    primaryCode: 'BUNDLE_ENGINE_UNSUPPORTED',
  },
  {
    accepted: true,
    archiveBytes: 1598,
    archiveSha256: '0f517fb5c1e5da4d27e38bd0003a460f534d45d2385bd6fbfd1014862f6f7945',
    artifact: 'valid/asset-bearing-conformance.sniptale-bundle.zip',
    effectKinds: ['standalone'],
  },
  {
    accepted: true,
    archiveBytes: 3500,
    archiveSha256: 'ac350ce9dcbe64ac000bac52b6d28a28c2d646e37a117e4bb46ebfb7c03a1f75',
    artifact: 'valid/multi-effect-with-asset.sniptale-bundle.zip',
    effectKinds: ['standalone', 'targetEffect', 'transition', 'standalone'],
  },
  {
    accepted: true,
    archiveBytes: 958,
    archiveSha256: 'bdf28dfae01facd628b9f4ab9b5c442a1c6e5c468594d0a779c3c430e13964f8',
    artifact: 'valid/standalone-minimal.sniptale-bundle.zip',
    effectKinds: ['standalone'],
  },
  {
    accepted: true,
    archiveBytes: 1026,
    archiveSha256: 'd5e359dac03448b5f86ce950c8ce8588c2052a7d5cc2770d496f5b44b06e73df',
    artifact: 'valid/target-effect.sniptale-bundle.zip',
    effectKinds: ['targetEffect'],
  },
  {
    accepted: true,
    archiveBytes: 1066,
    archiveSha256: 'a5720b3d02cbbbdbb40496f363755973001fad50169050b61300f1801b7a01af',
    artifact: 'valid/transition.sniptale-bundle.zip',
    effectKinds: ['transition'],
  },
];

export function readEffectBundleCorpusArchive(testCase: EffectBundleCorpusCase): Uint8Array {
  return Uint8Array.from(
    readFileSync(
      new URL(
        `../../../apps/extension/src/features/video/project/effect-bundle/fixtures/corpus/${testCase.artifact}`,
        import.meta.url
      )
    )
  );
}
