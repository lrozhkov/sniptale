import { expect, it } from 'vitest';

import {
  assertGeneratedOwnershipQllIsFresh,
  generateSniptaleOwnershipQll,
} from './generate-ownership.mjs';

it('generates CodeQL ownership predicates from JSON policy data', () => {
  const qll = generateSniptaleOwnershipQll({
    storagePolicy: {
      secretStorageOwners: [
        {
          file: 'apps/extension/src/composition/persistence/ai-settings/provider-secrets.store.ts',
          owner: 'shared-ai-storage',
        },
        {
          file: 'apps/extension/src/composition/persistence/ai-settings/provider-secret-keys.store.ts',
          owner: 'shared-ai-storage',
        },
      ],
      sensitiveRetentionOwners: [],
    },
    networkPolicy: {
      secretHeaderOwners: [
        {
          file: 'apps/extension/src/background/ai/llm/transport/request.ts',
          owner: 'background-llm-transport',
        },
      ],
      credentialedFetchOwners: [
        {
          file: 'apps/extension/src/content/parser/web-snapshot/assets.ts',
          owner: 'content-web-snapshot-assets',
        },
      ],
    },
  });

  expect(qll).toContain(
    '"apps/extension/src/composition/persistence/ai-settings/provider-secret-keys.store.ts"'
  );
  expect(qll).toContain('predicate isAllowedSensitiveRetentionOwner(File file)');
  expect(qll).toContain('"apps/extension/src/background/ai/llm/transport/request.ts"');
  expect(qll).toContain('"apps/extension/src/content/parser/web-snapshot/assets.ts"');
});

it('keeps committed CodeQL ownership predicates in sync with JSON policy', () => {
  expect(() => assertGeneratedOwnershipQllIsFresh()).not.toThrow();
});
