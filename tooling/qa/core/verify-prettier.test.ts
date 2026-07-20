import { describe, expect, it } from 'vitest';

import { runPrettierCheck } from './verify-prettier.mjs';

describe('QA Prettier wrapper', () => {
  it('preserves canonical byte-exact fixtures listed in .prettierignore', async () => {
    const fixture =
      'packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
      'neutral-runtime-conformance.sniptale-effect.json';

    await expect(runPrettierCheck([fixture])).resolves.toMatchObject({ failures: [] });
  });
});
