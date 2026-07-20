import { importFresh, withCwd, writeJson } from './test-helpers';

export function writeSonarjsTsconfig(root: string) {
  writeJson(root, 'tsconfig.json', {
    compilerOptions: {
      jsx: 'react-jsx',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      target: 'ES2022',
    },
    include: ['apps/extension/src/**/*'],
  });
  writeJson(root, 'tooling/configs/qa/sonarjs-baseline.json', {
    schemaVersion: 1,
    entries: [],
  });
}

export async function importSonarjsVerifier(root: string) {
  return withCwd(root, () =>
    importFresh<typeof import('./verify-sonarjs.mjs')>('./verify-sonarjs.mjs')
  );
}

export function createSonarjsToolNoiseEntry(overrides: Record<string, unknown> = {}) {
  return {
    debtId: 'noise.sonarjs.example',
    classification: 'tool-noise',
    file: 'apps/extension/src/example.ts',
    line: 4,
    messagePattern: 'exact false positive',
    owner: 'example-owner',
    reason: 'confirmed upstream parser-services mismatch',
    rule: 'sonarjs/no-all-duplicated-branches',
    targetAction: 'replace-with-repo-rule',
    ...overrides,
  };
}

export function createInjectedSonarjsViolation(overrides: Record<string, unknown> = {}) {
  return {
    column: 1,
    file: 'apps/extension/src/example.ts',
    line: 4,
    message: 'exact false positive',
    rule: 'sonarjs/no-all-duplicated-branches',
    ...overrides,
  };
}
