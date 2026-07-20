import { expect, it } from 'vitest';

import { createTempRoot, importFresh, writeFile } from './test-helpers';

function createPassingPackageJson() {
  return {
    engines: { node: '>=22.12 <23' },
    dependencies: {
      react: '^19.2.5',
      'react-dom': '^19.2.5',
    },
    devDependencies: {
      '@types/react': '^19.2.14',
      '@types/react-dom': '^19.2.3',
      '@vitejs/plugin-react': '^5.2.0',
    },
  };
}

function createFailingPackageJson() {
  return {
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/react': '^18.2.61',
      '@types/react-dom': '^18.2.19',
      '@vitejs/plugin-react': '^4.2.1',
    },
  };
}

function writeConfigPolicyPackageJson(root, packageJson) {
  writeFile(root, 'package.json', JSON.stringify(packageJson, null, 2));
  writeFile(
    root,
    'package-lock.json',
    JSON.stringify({ packages: { '': { engines: packageJson.engines } } }, null, 2)
  );
}

function writePassingConfigPolicyFixture(root) {
  writeConfigPolicyPackageJson(root, createPassingPackageJson());
  writeFile(
    root,
    'tsconfig.json',
    `{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    /* Baseline guardrail */
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
`
  );
  writeFile(
    root,
    'tsconfig.node.json',
    JSON.stringify(
      {
        compilerOptions: {
          forceConsistentCasingInFileNames: true,
          verbatimModuleSyntax: true,
        },
      },
      null,
      2
    )
  );
  writeFile(
    root,
    'apps/extension/manifest.json',
    JSON.stringify({ minimum_chrome_version: '140' }, null, 2)
  );
  writeFile(
    root,
    'apps/extension/vite.config.ts',
    "export default { build: { target: 'chrome140' } };\n"
  );
}

async function importConfigPolicyModule() {
  return importFresh<typeof import('./verify-config-policy.mjs')>('./verify-config-policy.mjs');
}

function expectConfigPolicyViolationsToContain(violations) {
  expect(violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'tsconfig.json',
        message: 'compilerOptions.target must be "ES2024"',
      }),
      expect.objectContaining({
        file: 'package.json',
        message: 'engines.node must be ">=22.12 <23"',
      }),
      expect.objectContaining({
        file: 'package-lock.json',
        message: 'packages[""].engines.node must be ">=22.12 <23"',
      }),
      expect.objectContaining({
        file: 'package.json',
        message: 'dependencies.react must stay on the "^19.2."x baseline',
      }),
      expect.objectContaining({
        file: 'package.json',
        message: 'devDependencies.@vitejs/plugin-react must stay on the "^5.2."x baseline',
      }),
      expect.objectContaining({
        file: 'tsconfig.json',
        message: 'compilerOptions.verbatimModuleSyntax must be true',
      }),
      expect.objectContaining({
        file: 'tsconfig.json',
        message: 'compilerOptions.lib must be ["ES2024","DOM","DOM.Iterable"]',
      }),
      expect.objectContaining({
        file: 'tsconfig.node.json',
        message: 'compilerOptions.verbatimModuleSyntax must be true',
      }),
      expect.objectContaining({
        file: 'apps/extension/manifest.json',
        message: 'minimum_chrome_version must be "140"',
      }),
      expect.objectContaining({
        file: 'apps/extension/vite.config.ts',
        message: 'build.target must be "chrome140"',
      }),
    ])
  );
}

it('passes when runtime baseline config matches policy', async () => {
  const root = createTempRoot('verify-config-policy-pass-');
  writePassingConfigPolicyFixture(root);
  const module = await importConfigPolicyModule();

  expect(module.collectConfigPolicyViolations({ rootDir: root })).toEqual([]);
});

it('does not accept the Vite build target when chrome140 appears only in a comment', async () => {
  const root = createTempRoot('verify-config-policy-vite-comment-');
  writePassingConfigPolicyFixture(root);
  writeFile(
    root,
    'apps/extension/vite.config.ts',
    ['// target: "chrome140"', "export default { build: { target: 'chrome139' } };", ''].join('\n')
  );

  const module = await importConfigPolicyModule();

  expect(module.collectConfigPolicyViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/vite.config.ts',
      message: 'build.target must be "chrome140"',
    }),
  ]);
});

it('rejects lockfile engine drift independently from the root package', async () => {
  const root = createTempRoot('verify-config-policy-lock-engine-');
  writePassingConfigPolicyFixture(root);
  writeFile(root, 'package-lock.json', JSON.stringify({ packages: { '': {} } }, null, 2));
  const module = await importConfigPolicyModule();

  expect(module.collectConfigPolicyViolations({ rootDir: root })).toContainEqual({
    rule: 'config-policy',
    file: 'package-lock.json',
    message: 'packages[""].engines.node must be ">=22.12 <23"',
  });
});

it('does not accept the Vite build target from an unrelated object', async () => {
  const root = createTempRoot('verify-config-policy-vite-unrelated-object-');
  writePassingConfigPolicyFixture(root);
  writeFile(
    root,
    'apps/extension/vite.config.ts',
    [
      "const fixture = { build: { target: 'chrome140' } };",
      'void fixture;',
      "export default { build: { target: 'chrome139' } };",
      '',
    ].join('\n')
  );

  const module = await importConfigPolicyModule();

  expect(module.collectConfigPolicyViolations({ rootDir: root })).toEqual([
    expect.objectContaining({
      file: 'apps/extension/vite.config.ts',
      message: 'build.target must be "chrome140"',
    }),
  ]);
});

it('accepts the Vite build target from a defineConfig callback return object', async () => {
  const root = createTempRoot('verify-config-policy-vite-define-config-');
  writePassingConfigPolicyFixture(root);
  writeFile(
    root,
    'apps/extension/vite.config.ts',
    [
      "import { defineConfig } from 'vite';",
      "export default defineConfig(() => ({ build: { target: 'chrome140' } }));",
      '',
    ].join('\n')
  );

  const module = await importConfigPolicyModule();

  expect(module.collectConfigPolicyViolations({ rootDir: root })).toEqual([]);
});

it('reports missing strictness flags, build target, and chrome floor drift', async () => {
  const root = createTempRoot('verify-config-policy-fail-');
  writeConfigPolicyPackageJson(root, createFailingPackageJson());
  writeFile(
    root,
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
        },
      },
      null,
      2
    )
  );
  writeFile(root, 'tsconfig.node.json', JSON.stringify({ compilerOptions: {} }, null, 2));
  writeFile(
    root,
    'apps/extension/manifest.json',
    JSON.stringify({ minimum_chrome_version: '116' }, null, 2)
  );
  writeFile(root, 'apps/extension/vite.config.ts', 'export default { build: {} };\n');

  const module = await importConfigPolicyModule();

  expectConfigPolicyViolationsToContain(module.collectConfigPolicyViolations({ rootDir: root }));
});
