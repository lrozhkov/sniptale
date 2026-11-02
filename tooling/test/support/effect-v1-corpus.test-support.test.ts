import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { z } from 'zod';

it('loads the locked effect corpus through the native Node ESM loader used during browser test collection', () => {
  const moduleUrl = new URL('./effect-v1-corpus.test-support.ts', import.meta.url).href;
  const program = `
    import { createHash } from 'node:crypto';
    const corpus = await import(process.argv[1]);
    const first = corpus.EFFECT_BUNDLE_CORPUS[0];
    const bytes = corpus.readEffectBundleCorpusArchive(first);
    console.log(JSON.stringify({
      count: corpus.EFFECT_BUNDLE_CORPUS.length,
      length: bytes.byteLength,
      declaredLength: first.archiveBytes,
      shaMatches: createHash('sha256').update(bytes).digest('hex') === first.archiveSha256,
    }));
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', program, moduleUrl],
    {
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  expect(result.status, result.stderr).toBe(0);
  const value = z
    .object({
      count: z.number().int().positive(),
      length: z.number().int().positive(),
      declaredLength: z.number().int().positive(),
      shaMatches: z.literal(true),
    })
    .parse(JSON.parse(result.stdout));
  expect(value.length).toBe(value.declaredLength);
});
