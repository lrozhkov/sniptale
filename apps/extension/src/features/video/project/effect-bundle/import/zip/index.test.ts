import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
      '4f52a70f26b3e0e8fd69630aafc5b37fcea73bf4'
    ),
} as const;

describe('EffectV1 locked ZIP artifact corpus', () => {
  it('pins the history-independent authoritative SDK corpus contract', () => {
    const { effectSdkCommit, ...contractLock } = EFFECT_BUNDLE_CORPUS_LOCK;

    expect(effectSdkCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(contractLock).toEqual({
      bundleEngine: 'sniptale.bundle.engine2',
      bundleManifest: 'sniptale.bundle.v1',
      effectSchema: 'sniptale.effect.v1',
      engineVersion: '2.0',
      corpusVersion: '0.1.0',
      formatVersion: 'sniptale.bundle-corpus.v1',
    });
    expect(EFFECT_BUNDLE_CORPUS).toHaveLength(14);
  });

  it('keeps the exact SDK commit provenance check disabled without deleting it', () => {
    expect(EXACT_SDK_COMMIT_PROVENANCE_CHECK.enabled).toBe(false);
    expect(EXACT_SDK_COMMIT_PROVENANCE_CHECK.run).toEqual(expect.any(Function));
  });

  it('verifies the complete source manifest and canonical schema', () => {
    const directory = new URL('../../fixtures/corpus/', import.meta.url);
    const sums = readFileSync(new URL('SHA256SUMS', directory), 'utf8').trim().split('\n');
    expect(sums).toHaveLength(17);
    const listed = sums.map((line) => {
      const [digest, path] = line.split('  ');
      if (!digest || !path) throw new Error('Invalid checksum manifest');
      expect(
        createHash('sha256')
          .update(readFileSync(new URL(path, directory)))
          .digest('hex'),
        path
      ).toBe(digest);
      return path;
    });
    const actual = readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(fileURLToPath(directory), `${entry.parentPath}/${entry.name}`).replaceAll(
          '\\',
          '/'
        )
      )
      .filter((path) => path !== 'SHA256SUMS');
    expect(actual.sort()).toEqual(listed.sort());
    expect(readFileSync(new URL('sniptale-effect-v1.schema.json', directory))).toEqual(
      readFileSync(
        new URL(
          '../../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/sniptale-effect-v1.schema.json',
          import.meta.url
        )
      )
    );
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
