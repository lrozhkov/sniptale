import { readFileSync } from 'node:fs';
import corpusLock from '../../../apps/extension/src/features/video/project/effect-bundle/fixtures/corpus/contract-lock.json' with { type: 'json' };
import corpusExpectations from '../../../apps/extension/src/features/video/project/effect-bundle/fixtures/corpus/expectations.json' with { type: 'json' };

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

export const EFFECT_BUNDLE_CORPUS_LOCK = corpusLock;
export const EFFECT_BUNDLE_CORPUS: EffectBundleCorpusCase[] = corpusExpectations.cases;

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
