import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
const oxlintEntry = path.resolve('node_modules/oxlint/bin/oxlint');
const sonarjsEntry = fileURLToPath(import.meta.resolve('eslint-plugin-sonarjs'));

const cases = [
  {
    invalid: 'declare const condition: boolean;\nexport const value = condition ? 1 : 1;\n',
    rule: 'sonarjs/no-all-duplicated-branches',
    valid: 'declare const condition: boolean;\nexport const value = condition ? 1 : 2;\n',
  },
  {
    invalid:
      "export function value(input: string) {\n  if (input === 'a') return 1;\n" +
      "  else if (input === 'b') return 1;\n  return 2;\n}\n",
    rule: 'sonarjs/no-duplicated-branches',
    valid:
      "export function value(input: string) {\n  if (input === 'a') return 1;\n" +
      "  else if (input === 'b') return 2;\n  return 3;\n}\n",
  },
  {
    invalid:
      "type Source = { a: string; b: string };\nexport type Value = Pick<Source, 'a' | 'a'>;\n",
    rule: 'sonarjs/no-duplicate-in-composite',
    valid:
      "type Source = { a: string; b: string };\nexport type Value = Pick<Source, 'a' | 'b'>;\n",
  },
  {
    invalid:
      'let nested = 0;\nfunction accept(value: number) { return value; }\nexport const value = accept((nested = 1));\n',
    rule: 'sonarjs/no-nested-assignment',
    valid:
      'let nested = 0;\nfunction accept(value: number) { return value; }\n' +
      'nested = 1;\nexport const value = accept(nested);\n',
  },
] as const;
const RULE_IDS = cases.map(({ rule }) => rule);

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { force: true, recursive: true });
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarjs-oxlint-plugin-'));
  roots.push(root);
  return root;
}

function runOxlint(root: string, rule: string, source: string, pluginSpecifier = sonarjsEntry) {
  const sourcePath = path.join(root, 'fixture.ts');
  const configPath = path.join(root, 'oxlint.json');
  fs.writeFileSync(sourcePath, source);
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      jsPlugins: [{ name: 'sonarjs', specifier: pluginSpecifier }],
      rules: { [rule]: 'error' },
    })
  );
  return spawnSync(
    process.execPath,
    [oxlintEntry, '--config', configPath, '--format', 'unix', sourcePath],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
}

it('runs every retained syntax-only SonarJS rule through Oxlint', () => {
  expect(RULE_IDS).toHaveLength(4);

  for (const fixture of cases) {
    const root = createRoot();
    const invalid = runOxlint(root, fixture.rule, fixture.invalid);
    const valid = runOxlint(root, fixture.rule, fixture.valid);
    const invalidOutput = `${invalid.stdout}\n${invalid.stderr}`;
    const validOutput = `${valid.stdout}\n${valid.stderr}`;
    const diagnostic = `sonarjs(${fixture.rule.replace('sonarjs/', '')})`;

    expect(invalid.status, fixture.rule).toBe(1);
    expect(invalidOutput, fixture.rule).toContain(diagnostic);
    expect(valid.status, fixture.rule).toBe(0);
    expect(validOutput, fixture.rule).not.toContain(diagnostic);
  }
}, 60_000);

it('keeps parser and plugin failures blocking', () => {
  const root = createRoot();
  const parseFailure = runOxlint(root, RULE_IDS[0], 'export const broken = ;\n');
  const pluginFailure = runOxlint(
    root,
    RULE_IDS[0],
    'export const value = 1;\n',
    './missing-sonarjs-plugin.mjs'
  );

  expect(parseFailure.status).not.toBe(0);
  expect(`${parseFailure.stdout}\n${parseFailure.stderr}`).toMatch(/parse|syntax|expected/iu);
  expect(pluginFailure.status).not.toBe(0);
  expect(`${pluginFailure.stdout}\n${pluginFailure.stderr}`).toMatch(
    /failed to load JS plugin|cannot find module/iu
  );
});

it('binds retained rules to the production scope and excludes generated owners', () => {
  const config = JSON.parse(fs.readFileSync('.oxlintrc.json', 'utf8')) as {
    jsPlugins: Array<{ name: string; specifier: string }>;
    overrides: Array<{ files: string[]; rules?: Record<string, string> }>;
  };
  const enabled = config.overrides.find(({ rules = {} }) =>
    RULE_IDS.every((rule) => rules[rule] === 'error')
  );
  const disabledFiles = config.overrides
    .filter(({ rules = {} }) => RULE_IDS.every((rule) => rules[rule] === 'off'))
    .flatMap(({ files }) => files);

  expect(config.jsPlugins.filter(({ name }) => name === 'sonarjs')).toEqual([
    { name: 'sonarjs', specifier: 'eslint-plugin-sonarjs' },
  ]);
  expect(enabled?.files).toEqual([
    'apps/extension/src/**/*.{ts,tsx,js,mjs,cjs}',
    'packages/*/src/**/*.{ts,tsx,js,mjs,cjs}',
  ]);
  expect(disabledFiles.filter((file) => /(?:vendor|generated|__generated__)/u.test(file))).toEqual([
    'apps/extension/src/**/vendor/**/*.{ts,tsx,js,mjs,cjs}',
    'apps/extension/src/**/generated/**/*.{ts,tsx,js,mjs,cjs}',
    'apps/extension/src/**/__generated__/**/*.{ts,tsx,js,mjs,cjs}',
  ]);
}, 20_000);
