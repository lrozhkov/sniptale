import { describe, expect, it } from 'vitest';

import { withCanonicalFacadeModule } from './verify-canonical-facades.test-support';

function verifiesLegacyRootInternalImportViolation() {
  return withCanonicalFacadeModule(
    {
      'apps/extension/src/content/selection/locker.ts': "export * from './locker/root';\n",
      'apps/extension/src/content/selection/locker/root.ts': 'export const value = 1;\n',
      'apps/extension/src/content/selection/use-locker.ts':
        "import { value } from './locker';\nexport const next = value;\n",
    },
    (module, root) => {
      expect(
        module.collectLegacyRootImportViolations(
          ['apps/extension/src/content/selection/use-locker.ts'],
          { root }
        )
      ).toEqual([
        expect.objectContaining({
          rule: 'legacy-root-import',
          file: 'apps/extension/src/content/selection/use-locker.ts',
        }),
      ]);
    }
  );
}

function verifiesSharedRootImportsNowRequireCanonicalOwnerPaths() {
  return withCanonicalFacadeModule(
    {
      'packages/platform/src/observability/logger.ts': "export * from './logger/core';\n",
      'packages/platform/src/observability/logger/core.ts': 'export const value = 1;\n',
      'packages/platform/src/observability/use-logger.ts':
        "import { value } from './logger';\nexport const next = value;\n",
    },
    (module, root) => {
      expect(
        module.collectLegacyRootImportViolations(
          ['packages/platform/src/observability/use-logger.ts'],
          { root }
        )
      ).toEqual([
        expect.objectContaining({
          rule: 'legacy-root-import',
          file: 'packages/platform/src/observability/use-logger.ts',
        }),
      ]);
    }
  );
}

function verifiesUnchangedLegacyImportsStayOutOfWorkspaceScope() {
  return withCanonicalFacadeModule(
    {
      'apps/extension/src/content/selection/locker.ts': "export * from './locker/root';\n",
      'apps/extension/src/content/selection/locker/root.ts': 'export const value = 1;\n',
      'apps/extension/src/content/selection/use-locker.ts':
        "import { value } from './locker';\nexport const next = value + 1;\n",
    },
    (module, root) => {
      expect(
        module.collectLegacyRootImportViolations(
          ['apps/extension/src/content/selection/use-locker.ts'],
          {
            changedLineMap: new Map([
              ['apps/extension/src/content/selection/use-locker.ts', new Set([2])],
            ]),
            root,
          }
        )
      ).toEqual([]);
    }
  );
}

async function verifiesThinFacadePasses() {
  await withCanonicalFacadeModule(
    {
      'src/shared/logger.ts': "export { createLogger } from './logger/core';\n",
      'packages/platform/src/observability/logger/core.ts':
        'export const createLogger = () => undefined;\n',
      'src/shared/runtime-messaging.ts': "export * from './runtime-messaging/public';\n",
      'src/shared/platform/runtime-messaging/public.ts': 'export const value = 1;\n',
      'src/shared/theme.ts': "export * from './theme/public';\n",
      'src/shared/ui/theme/public.ts': 'export const theme = {};\n',
    },
    (module, root) => {
      expect(
        module.collectCanonicalFacadeViolations(
          ['src/shared/logger.ts', 'src/shared/runtime-messaging.ts', 'src/shared/theme.ts'],
          { root }
        )
      ).toEqual([]);
    }
  );
}

async function verifiesAllowlistedFacadeLogicViolation() {
  await withCanonicalFacadeModule(
    {
      'src/shared/logger.ts': "export { createLogger } from './logger/core';\nconst value = 1;\n",
      'packages/platform/src/observability/logger/core.ts':
        'export const createLogger = () => undefined;\n',
    },
    (module, root) => {
      expect(module.collectCanonicalFacadeViolations(['src/shared/logger.ts'], { root })).toEqual([
        expect.objectContaining({
          rule: 'root-facade-non-facade-logic',
          file: 'src/shared/logger.ts',
        }),
      ]);
    }
  );
}

async function verifiesSelfRecursiveFacadeViolation() {
  await withCanonicalFacadeModule(
    {
      'apps/extension/src/content/selection/locker.ts': "export * from './locker';\n",
      'apps/extension/src/content/selection/locker/index.ts': 'export const value = 1;\n',
    },
    (module, root) => {
      expect(
        module.collectCanonicalFacadeViolations(
          ['apps/extension/src/content/selection/locker.ts'],
          { root }
        )
      ).toEqual([
        expect.objectContaining({
          rule: 'root-facade-self-recursive-target',
          file: 'apps/extension/src/content/selection/locker.ts',
        }),
      ]);
    }
  );
}

async function verifiesExplicitCanonicalOwnerFacadeAllowance() {
  await withCanonicalFacadeModule(
    {
      'apps/extension/src/content/selection/locker.ts': "export * from './locker/root';\n",
      'apps/extension/src/content/selection/locker/root.ts': 'export const value = 1;\n',
    },
    (module, root) => {
      expect(
        module.collectCanonicalFacadeViolations(
          ['apps/extension/src/content/selection/locker.ts'],
          { root }
        )
      ).toEqual([]);
    }
  );
}

async function verifiesExplicitFacadeInputStaysThin() {
  await withCanonicalFacadeModule(
    {
      'src/shared/types/index.ts':
        "export * from '../contracts/messaging/message-types';\nconst value = 1;\n",
      '@sniptale/runtime-contracts/messaging/message-types': 'export const message = 1;\n',
    },
    (module, root) => {
      expect(
        module.collectCanonicalFacadeViolations(['src/shared/types/index.ts'], { root })
      ).toEqual([
        expect.objectContaining({
          rule: 'root-facade-non-facade-logic',
          file: 'src/shared/types/index.ts',
        }),
      ]);
    }
  );
}

async function verifiesChangedOwnerFacadeDetection() {
  await withCanonicalFacadeModule(
    {
      'apps/extension/src/content/selection/locker.ts': "export * from './locker/root';\n",
      'apps/extension/src/content/selection/locker/root.ts': 'export const value = 1;\n',
    },
    (module, root) => {
      expect(
        module.collectChangedOwnerFacadeFiles(['apps/extension/src/content/selection/locker.ts'], {
          root,
        })
      ).toEqual(['apps/extension/src/content/selection/locker.ts']);
    }
  );
}

async function verifiesNonSrcOwnerEntrypointIgnore() {
  await withCanonicalFacadeModule(
    {
      'tooling/qa/evidence/repo-audit-evidence.mjs':
        "import { runCli } from './repo-audit-evidence/cli.mjs';\nrunCli();\n",
      'tooling/qa/evidence/repo-audit-evidence/cli.mjs': 'export function runCli() {}\n',
    },
    (module, root) => {
      expect(
        module.collectChangedOwnerFacadeFiles(['tooling/qa/evidence/repo-audit-evidence.mjs'], {
          root,
        })
      ).toEqual([]);
    }
  );
}

async function verifiesDeletedSameNameFacadeIgnore() {
  await withCanonicalFacadeModule(
    {
      'apps/extension/src/content/selection/locker/root.ts': 'export const value = 1;\n',
    },
    (module, root) => {
      expect(
        module.collectChangedOwnerFacadeFiles(['apps/extension/src/content/selection/locker.ts'], {
          root,
        })
      ).toEqual([]);
    }
  );
}

describe('collectCanonicalFacadeViolations', () => {
  it('passes thin facade files', verifiesThinFacadePasses);
  it('flags runtime logic inside an allowlisted facade', verifiesAllowlistedFacadeLogicViolation);
  it('flags self-recursive same-name facade exports', verifiesSelfRecursiveFacadeViolation);
  it(
    'allows same-name facades when they point to an explicit canonical owner file',
    verifiesExplicitCanonicalOwnerFacadeAllowance
  );
  it('keeps explicit facade inputs import/export-only', verifiesExplicitFacadeInputStaysThin);
  it(
    'flags same-name root facades that re-export through an ambiguous owner path',
    verifiesSelfRecursiveFacadeViolation
  );
  it('detects changed same-name owner facades', verifiesChangedOwnerFacadeDetection);
  it('ignores deleted same-name owner facades', verifiesDeletedSameNameFacadeIgnore);
  it('ignores non-src same-name owner entrypoints', verifiesNonSrcOwnerEntrypointIgnore);

  it(
    'flags internal imports that still target a legacy root facade',
    verifiesLegacyRootInternalImportViolation
  );
  it(
    'requires canonical owner imports for shared same-name roots by default',
    verifiesSharedRootImportsNowRequireCanonicalOwnerPaths
  );
  it(
    'does not rescan unchanged legacy imports in content-touched files',
    verifiesUnchangedLegacyImportsStayOutOfWorkspaceScope
  );
});
