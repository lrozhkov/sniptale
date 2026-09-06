import fs from 'node:fs';

import { expect, it } from 'vitest';

type RuleSetting = string | [string, ...unknown[]];
type RuleMap = Record<string, RuleSetting>;

const migration = JSON.parse(
  fs.readFileSync('tooling/configs/qa/lint-rule-migration.data.json', 'utf8')
) as {
  canonicalAuthority: string;
  doNotAdopt: Array<{
    decision: string;
    priorDependency: string;
    priorRule: string;
    reason: string;
    targetRule: string;
  }>;
  explicitPriorRules: Array<{
    decision: string;
    priorApplications: Array<{ scope: string; severity: string }>;
    priorRule: string;
    targetOwner: string;
    targetRule: string;
  }>;
  oxlint: {
    activeRuleIds: string[];
    categoryDecisions: Record<string, string>;
    defaultActiveSeverity: string;
    disabledRuleIds: string[];
    mixedSeverityRuleIds: string[];
    warningRuleIds: string[];
  };
  customGuards: Array<{ compilerApi: string; executionOwner: string; roots: string[] }>;
  residualEslint: Array<{
    defaultSeverity?: string;
    owner: string;
    rules: string[];
    settings?: Record<string, string>;
  }>;
};
const migratedSonarjsRuleIds = migration.oxlint.activeRuleIds.filter((rule) =>
  rule.startsWith('sonarjs/')
);

const EXPECTED_RULE_DECISIONS: Record<string, [string, string, string]> = {
  '@typescript-eslint/ban-ts-comment': ['Move', '.oxlintrc.json', 'typescript/ban-ts-comment'],
  '@typescript-eslint/consistent-type-imports': [
    'Move',
    '.oxlintrc.json',
    'typescript/consistent-type-imports',
  ],
  '@typescript-eslint/no-explicit-any': ['Move', '.oxlintrc.json', 'typescript/no-explicit-any'],
  '@typescript-eslint/no-floating-promises': [
    'Move',
    '.oxlintrc.json',
    'typescript/no-floating-promises',
  ],
  '@typescript-eslint/no-namespace': ['Move', '.oxlintrc.json', 'typescript/no-namespace'],
  '@typescript-eslint/no-unsafe-argument': [
    'Move',
    '.oxlintrc.json',
    'typescript/no-unsafe-argument',
  ],
  '@typescript-eslint/no-unsafe-assignment': [
    'Move',
    '.oxlintrc.json',
    'typescript/no-unsafe-assignment',
  ],
  '@typescript-eslint/no-unsafe-call': ['Move', '.oxlintrc.json', 'typescript/no-unsafe-call'],
  '@typescript-eslint/no-unsafe-member-access': [
    'Move',
    '.oxlintrc.json',
    'typescript/no-unsafe-member-access',
  ],
  '@typescript-eslint/no-unsafe-return': ['Move', '.oxlintrc.json', 'typescript/no-unsafe-return'],
  '@typescript-eslint/no-unused-vars': ['Move', '.oxlintrc.json', 'no-unused-vars'],
  '@typescript-eslint/switch-exhaustiveness-check': [
    'Move',
    '.oxlintrc.json',
    'typescript/switch-exhaustiveness-check',
  ],
  'no-console': ['Move', '.oxlintrc.json', 'no-console'],
  'no-empty-pattern': ['Move', '.oxlintrc.json', 'no-empty-pattern'],
  'no-irregular-whitespace': ['Move', '.oxlintrc.json', 'no-irregular-whitespace'],
  'no-restricted-syntax': [
    'Custom guard',
    'tooling/qa/guards/product-contracts/contracts/contract-enum-guard.mjs',
    'contract-enum',
  ],
  'no-useless-escape': ['Move', '.oxlintrc.json', 'no-useless-escape'],
  'no-var': ['Move', '.oxlintrc.json', 'no-var'],
  'prefer-const': ['Move', '.oxlintrc.json', 'prefer-const'],
  'react-hooks/exhaustive-deps': ['Move', '.oxlintrc.json', 'react/exhaustive-deps'],
  'react-hooks/rules-of-hooks': ['Move', '.oxlintrc.json', 'react/rules-of-hooks'],
  'security/detect-bidi-characters': [
    'Move JS plugin',
    '.oxlintrc.json',
    'security/detect-bidi-characters',
  ],
  'security/detect-buffer-noassert': [
    'Move JS plugin',
    '.oxlintrc.json',
    'security/detect-buffer-noassert',
  ],
  'security/detect-eval-with-expression': ['Move', '.oxlintrc.json', 'no-eval'],
  'security/detect-new-buffer': ['Move JS plugin', '.oxlintrc.json', 'security/detect-new-buffer'],
  'security/detect-non-literal-regexp': [
    'Move JS plugin',
    '.oxlintrc.json',
    'security/detect-non-literal-regexp',
  ],
  'security/detect-object-injection': [
    'Move JS plugin',
    '.oxlintrc.json',
    'security/detect-object-injection',
  ],
  'security/detect-unsafe-regex': [
    'Move JS plugin',
    '.oxlintrc.json',
    'security/detect-unsafe-regex',
  ],
};

const EXPECTED_PRIOR_APPLICATIONS = [
  '@typescript-eslint/ban-ts-comment|typescript-general|off',
  '@typescript-eslint/consistent-type-imports|product-typescript|error',
  '@typescript-eslint/no-explicit-any|product-typescript|error',
  '@typescript-eslint/no-explicit-any|typescript-general|off',
  '@typescript-eslint/no-floating-promises|product-typescript|error',
  '@typescript-eslint/no-namespace|declaration-files|off',
  '@typescript-eslint/no-unsafe-argument|product-typescript|error',
  '@typescript-eslint/no-unsafe-assignment|product-typescript|error',
  '@typescript-eslint/no-unsafe-call|product-typescript|error',
  '@typescript-eslint/no-unsafe-member-access|product-typescript|error',
  '@typescript-eslint/no-unsafe-return|product-typescript|error',
  '@typescript-eslint/no-unused-vars|typescript-general|warn',
  '@typescript-eslint/switch-exhaustiveness-check|switch-exhaustiveness-owners|error',
  'no-console|javascript|off',
  'no-console|typescript-general|off',
  'no-empty-pattern|e2e|off',
  'no-irregular-whitespace|typescript-general|off',
  'no-restricted-syntax|contract-roots|error',
  'no-useless-escape|typescript-general|off',
  'no-var|declaration-files|off',
  'prefer-const|javascript|off',
  'prefer-const|typescript-general|off',
  'react-hooks/exhaustive-deps|e2e|off',
  'react-hooks/exhaustive-deps|typescript-general|warn',
  'react-hooks/rules-of-hooks|e2e|off',
  'react-hooks/rules-of-hooks|typescript-general|error',
  'security/detect-bidi-characters|javascript|error',
  'security/detect-bidi-characters|typescript-general|error',
  'security/detect-buffer-noassert|javascript|error',
  'security/detect-buffer-noassert|typescript-general|error',
  'security/detect-eval-with-expression|javascript|error',
  'security/detect-eval-with-expression|typescript-general|error',
  'security/detect-new-buffer|javascript|error',
  'security/detect-new-buffer|typescript-general|error',
  'security/detect-non-literal-regexp|javascript|warn',
  'security/detect-non-literal-regexp|typescript-general|warn',
  'security/detect-object-injection|javascript|off',
  'security/detect-object-injection|typescript-general|off',
  'security/detect-unsafe-regex|javascript|warn',
  'security/detect-unsafe-regex|typescript-general|warn',
].toSorted();

function severity(setting: RuleSetting) {
  return Array.isArray(setting) ? setting[0] : setting;
}

it('covers every explicit Oxlint rule and override decision', () => {
  const config = JSON.parse(fs.readFileSync(migration.canonicalAuthority, 'utf8')) as {
    categories: Record<string, string>;
    rules: RuleMap;
    overrides: Array<{ rules?: RuleMap }>;
  };
  const ruleMaps = [config.rules, ...config.overrides.map(({ rules = {} }) => rules)];
  const activeRules = [
    ...new Set(
      ruleMaps.flatMap((rules) =>
        Object.entries(rules)
          .filter(([, setting]) => severity(setting) !== 'off')
          .map(([rule]) => rule)
      )
    ),
  ].sort();
  const disabledRules = [
    ...new Set(
      ruleMaps.flatMap((rules) =>
        Object.entries(rules)
          .filter(([, setting]) => severity(setting) === 'off')
          .map(([rule]) => rule)
      )
    ),
  ].sort();
  const warningRules = [
    ...new Set(
      ruleMaps.flatMap((rules) =>
        Object.entries(rules)
          .filter(([, setting]) => severity(setting) === 'warn')
          .map(([rule]) => rule)
      )
    ),
  ].sort();
  const errorRules = new Set(
    ruleMaps.flatMap((rules) =>
      Object.entries(rules)
        .filter(([, setting]) => severity(setting) === 'error')
        .map(([rule]) => rule)
    )
  );

  expect(migration.oxlint.categoryDecisions).toEqual(config.categories);
  expect(migration.oxlint.categoryDecisions).toEqual({ correctness: 'off' });
  expect(migration.oxlint.defaultActiveSeverity).toBe('error');
  expect(migration.oxlint.activeRuleIds).toEqual(activeRules);
  expect(migration.oxlint.disabledRuleIds).toEqual(disabledRules);
  expect(migration.oxlint.warningRuleIds).toEqual(warningRules);
  expect(migration.oxlint.mixedSeverityRuleIds).toEqual(
    warningRules.filter((rule) => errorRules.has(rule))
  );
});

it('does not silently activate the previously unused React Refresh lint dependency', () => {
  const config = JSON.parse(fs.readFileSync(migration.canonicalAuthority, 'utf8')) as {
    rules: RuleMap;
    overrides: Array<{ rules?: RuleMap }>;
  };
  const configuredRules = new Set([
    ...Object.keys(config.rules),
    ...config.overrides.flatMap(({ rules = {} }) => Object.keys(rules)),
  ]);

  expect(migration.doNotAdopt).toEqual([
    {
      decision: 'Do not adopt',
      priorDependency: 'eslint-plugin-react-refresh',
      priorRule: 'react-refresh/only-export-components',
      reason: [
        'The dependency was installed but the rule was absent from the effective ESLint',
        'and Oxlint policy; enabling it would add a new rule.',
      ].join(' '),
      targetRule: 'react/only-export-components',
    },
  ]);
  expect(configuredRules).not.toContain('react/only-export-components');
});

it('pins every explicit prior ESLint rule, application, and migration decision', () => {
  const decisions = Object.fromEntries(
    migration.explicitPriorRules.map(({ decision, priorRule, targetOwner, targetRule }) => [
      priorRule,
      [decision, targetOwner, targetRule],
    ])
  );
  const applications = migration.explicitPriorRules
    .flatMap(({ priorApplications, priorRule }) =>
      priorApplications.map(({ scope, severity }) => `${priorRule}|${scope}|${severity}`)
    )
    .toSorted();

  expect(decisions).toEqual(EXPECTED_RULE_DECISIONS);
  expect(applications).toEqual(EXPECTED_PRIOR_APPLICATIONS);
  expect(new Set(migration.explicitPriorRules.map(({ priorRule }) => priorRule)).size).toBe(28);
  expect(applications).toHaveLength(40);
});

it('resolves every migration target to its current canonical owner', () => {
  const config = JSON.parse(fs.readFileSync(migration.canonicalAuthority, 'utf8')) as {
    rules: RuleMap;
    overrides: Array<{ rules?: RuleMap }>;
  };
  const oxlintRules = new Set([
    ...Object.keys(config.rules),
    ...config.overrides.flatMap(({ rules = {} }) => Object.keys(rules)),
  ]);
  for (const row of migration.explicitPriorRules) {
    expect(fs.existsSync(row.targetOwner), row.priorRule).toBe(true);
    if (row.decision === 'Move' || row.decision === 'Move JS plugin') {
      expect(oxlintRules.has(row.targetRule), row.priorRule).toBe(true);
    } else {
      expect(row).toMatchObject({
        decision: 'Custom guard',
        targetRule: 'contract-enum',
      });
    }
  }
});

it('pins the custom TS6 guard roots and canonical execution owner', () => {
  expect(migration.customGuards).toEqual([
    expect.objectContaining({
      compilerApi: 'typescript@6',
      executionOwner: 'tooling/qa/guards/quality/verify-oxlint.mjs',
      roots: ['apps/extension/src/contracts/', 'packages/runtime-contracts/src/'],
    }),
  ]);
});

it('pins Security and syntax SonarJS as Oxlint JS plugins without a separate ESLint residual', () => {
  const oxlintConfig = JSON.parse(fs.readFileSync('.oxlintrc.json', 'utf8')) as {
    jsPlugins: Array<{ name: string; specifier: string }>;
    overrides: Array<{ rules?: RuleMap }>;
    rules: Record<string, string>;
  };
  expect(oxlintConfig.jsPlugins).toContainEqual({
    name: 'security',
    specifier: 'eslint-plugin-security',
  });
  expect(oxlintConfig.jsPlugins).toContainEqual({
    name: 'sonarjs',
    specifier: 'eslint-plugin-sonarjs',
  });
  expect(migration.residualEslint).toEqual([]);
  expect(
    Object.keys(oxlintConfig.rules).filter((rule) => rule.startsWith('security/'))
  ).toHaveLength(6);
  const configuredRules = new Set(
    oxlintConfig.overrides.flatMap(({ rules = {} }) => Object.keys(rules))
  );
  expect(migratedSonarjsRuleIds).toHaveLength(4);
  expect(migratedSonarjsRuleIds.every((rule) => configuredRules.has(rule))).toBe(true);
});
