import { expect, it } from 'vitest';

import { collectPersistenceOwnershipViolations } from '../../lifecycle/persistence-ownership/check.mjs';
import { createTempRoot, writeFile } from '../../../test-support/test-helpers';

function rules(violations: { rule: string }[]) {
  return violations.map((violation) => violation.rule);
}

it('blocks default stateManager imports outside approved owners', () => {
  const root = createTempRoot('audit-state-manager-default-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/feature/state.ts',
    "import { stateManager } from '../../shared/state-manager';\n"
  );
  const typeOnly = writeFile(
    root,
    'apps/extension/src/background/feature/types.ts',
    "import type { StateManager } from '../../shared/state-manager/types';\n"
  );
  const allowed = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    "import { stateManager } from '../state-manager';\n"
  );

  expect(rules(collectPersistenceOwnershipViolations([bad]))).toContain(
    'state-manager-singleton-owner-bypass'
  );
  expect(collectPersistenceOwnershipViolations([typeOnly, allowed])).toEqual([]);
});

it('keeps IndexedDB entrypoints behind explicit persistence authorities', () => {
  const root = createTempRoot('audit-state-authority-');
  const bad = writeFile(
    root,
    'apps/extension/src/background/session/cache.ts',
    "import { openDB } from 'idb'; export async function load() { return openDB('session-cache', 1); }\n"
  );
  const core = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    "import { openDB } from 'idb'; export async function initDB() { return openDB('sniptale', 1); }\n"
  );
  const admission = writeFile(
    root,
    'apps/extension/src/composition/persistence/infrastructure/indexed-db/admission.ts',
    'export async function inspect() { return indexedDB.databases(); }\n'
  );

  expect(rules(collectPersistenceOwnershipViolations([bad]))).toContain(
    'indexed-db-entrypoint-owner-bypass'
  );
  expect(collectPersistenceOwnershipViolations([core, admission])).toEqual([]);
});
