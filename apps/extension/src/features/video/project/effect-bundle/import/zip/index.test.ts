import { describe, expect, it } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import {
  EFFECT_BUNDLE_CORPUS,
  EFFECT_BUNDLE_CORPUS_LOCK,
  readEffectBundleCorpusArchive,
} from '../../../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from './index';

const EXACT_SDK_COMMIT_PROVENANCE_CHECK = {
  enabled: false,
  run: () =>
    expect(EFFECT_BUNDLE_CORPUS_LOCK.effectSdkCommit).toBe(
      '366f7036ac924b50ed586bfd67d95bd9ebf6d30c'
    ),
} as const;

describe('EffectV1 locked ZIP artifact corpus', () => {
  it('pins the history-independent authoritative SDK corpus contract', () => {
    const { effectSdkCommit, ...contractLock } = EFFECT_BUNDLE_CORPUS_LOCK;

    expect(effectSdkCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(contractLock).toEqual({
      corpusVersion: '0.1.0',
      formatVersion: 'sniptale.bundle-corpus.v1',
    });
    expect(EFFECT_BUNDLE_CORPUS).toHaveLength(14);
  });

  it('keeps the exact SDK commit provenance check disabled without deleting it', () => {
    expect(EXACT_SDK_COMMIT_PROVENANCE_CHECK.enabled).toBe(false);
    expect(EXACT_SDK_COMMIT_PROVENANCE_CHECK.run).toEqual(expect.any(Function));
  });

  it.each(EFFECT_BUNDLE_CORPUS)('$artifact', async (testCase) => {
    const bytes = readEffectBundleCorpusArchive(testCase);

    expect(bytes.byteLength).toBe(testCase.archiveBytes);
    expect(await sha256EffectV1Bytes(bytes)).toBe(testCase.archiveSha256);

    const result = await importEffectBundleZip(bytes);
    expect(result.ok).toBe(testCase.accepted);
    if (!testCase.accepted) {
      expect(result).toEqual(
        expect.objectContaining({
          primaryCode: testCase.primaryCode,
        })
      );
      return;
    }
    expect(result).toEqual(
      expect.objectContaining({
        bundle: expect.objectContaining({
          documents: expect.any(Array),
          manifest: expect.objectContaining({ engineVersion: '2.0' }),
        }),
        ok: true,
      })
    );
    if (result.ok) {
      expect(result.bundle.documents.map(({ document }) => document.kind)).toEqual(
        testCase.effectKinds
      );
    }
  });
});
