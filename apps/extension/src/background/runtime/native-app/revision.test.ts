import { expect, it } from 'vitest';

import { createNativeCanonicalRevision } from './revision';

it('creates stable prefixed revisions from canonically ordered values', async () => {
  const first = await createNativeCanonicalRevision('native', {
    nested: { enabled: true },
    actions: ['capture', 'record'],
  });
  const reordered = await createNativeCanonicalRevision('native', {
    actions: ['capture', 'record'],
    nested: { enabled: true },
  });

  expect(first).toBe(
    'native-sha256-86b59b4d976afd63a5f7f123c20ebcf222686da690880e9a86d593233f9479c7'
  );
  expect(reordered).toBe(first);
});
