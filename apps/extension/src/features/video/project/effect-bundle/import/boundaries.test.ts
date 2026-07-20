import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { createEffectBundleFailure } from '../diagnostics';
import {
  classifyEffectArtifactBytes,
  createUnrecognizedArtifactFailure,
  importEffectArtifactInCurrentThread,
} from './artifact';
import { createEffectDocumentFailure } from './document-failure';

describe('EffectV1 artifact byte dispatch', () => {
  it.each([
    [[0x50, 0x4b, 0x03, 0x04], 'bundle-zip'],
    [[0x50, 0x4b, 0x05, 0x06], 'bundle-zip'],
    [[0x50, 0x4b, 0x07, 0x08], 'bundle-zip'],
    [[0x20, 0x0a, 0x09, 0x7b], 'raw-json'],
    [[0x50, 0x4b, 0x01, 0x02], null],
    [[0x50, 0x4b], null],
    [[0x5b], null],
  ] as const)('classifies %j as %s', (bytes, expected) => {
    expect(classifyEffectArtifactBytes(Uint8Array.from(bytes))).toBe(expected);
  });

  it('imports both accepted artifact kinds in the isolated execution owner', async () => {
    const corpusCase = EFFECT_BUNDLE_CORPUS.find(({ accepted }) => accepted)!;

    await expect(
      importEffectArtifactInCurrentThread('bundle-zip', readEffectBundleCorpusArchive(corpusCase))
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(
      importEffectArtifactInCurrentThread('raw-json', readRawFixture())
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(
      importEffectArtifactInCurrentThread('raw-json', new TextEncoder().encode('{}'))
    ).resolves.toEqual(
      expect.objectContaining({ ok: false, primaryCode: 'BUNDLE_DOCUMENT_INVALID' })
    );
  });
});

describe('EffectV1 import diagnostics', () => {
  it('bounds and sanitizes diagnostic context at the boundary', () => {
    const failure = createEffectBundleFailure(
      'BUNDLE_ARCHIVE_INVALID',
      '$artifact',
      `\u0000 unsafe\n${'x'.repeat(300)}`
    );

    expect(failure.diagnostics[0]?.context).toHaveLength(256);
    expect(
      [...(failure.diagnostics[0]?.context ?? '')].some((character) => {
        const code = character.charCodeAt(0);
        return code < 0x20 || code === 0x7f;
      })
    ).toBe(false);
    expect(createUnrecognizedArtifactFailure().primaryCode).toBe('BUNDLE_ARCHIVE_INVALID');
  });

  it('projects only stable validator diagnostics', () => {
    const validation = validateEffectV1Document({});
    const failure = createEffectDocumentFailure('effects/invalid.json', validation.diagnostics);

    expect(failure.primaryCode).toBe('BUNDLE_DOCUMENT_INVALID');
    expect(failure.effectDiagnostics).toEqual(
      validation.diagnostics.map(({ code, path, severity }) => ({ code, path, severity }))
    );
  });
});

function readRawFixture(): Uint8Array {
  return new Uint8Array(
    readFileSync(
      new URL(
        '../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
          'neutral-standalone.sniptale-effect.json',
        import.meta.url
      )
    )
  );
}
