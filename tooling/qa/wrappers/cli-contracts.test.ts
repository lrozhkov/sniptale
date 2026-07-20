import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { QA_EXECUTION_CONTRACT_WRAPPERS } from '../core/qa-steps/contract.mjs';
import { parseWrapperArguments, QA_WRAPPER_CLI_CONTRACTS } from './cli-contracts.mjs';

function scriptResolvesTo(
  scripts: Record<string, string>,
  script: string,
  entrypoint: string,
  seen = new Set<string>()
): boolean {
  if (seen.has(script)) return false;
  seen.add(script);
  const command = scripts[script] ?? '';
  if (command.includes(entrypoint)) return true;
  const alias = command.match(/^npm run ([^\s]+)$/u)?.[1];
  return alias ? scriptResolvesTo(scripts, alias, entrypoint, seen) : false;
}

describe('canonical wrapper inventory', () => {
  it('covers every canonical wrapper family', () => {
    expect(Object.keys(QA_WRAPPER_CLI_CONTRACTS).sort()).toEqual([
      'qa:advisory',
      'qa:audit',
      'qa:build',
      'qa:checkpoint',
      'qa:closeout',
      'qa:e2e',
      'qa:preflight',
      'qa:release',
      'qa:release-harness',
    ]);
  });

  it('binds every canonical package script and lifecycle to one executable entrypoint', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect([...QA_EXECUTION_CONTRACT_WRAPPERS].sort()).toEqual(
      Object.keys(QA_WRAPPER_CLI_CONTRACTS).sort()
    );
    for (const contract of Object.values(QA_WRAPPER_CLI_CONTRACTS)) {
      expect(fs.existsSync(contract.entrypoint), contract.command).toBe(true);
      for (const script of contract.scripts) {
        expect(scriptResolvesTo(packageJson.scripts, script, contract.entrypoint), script).toBe(
          true
        );
      }
    }
  });
});

describe('canonical wrapper argument contracts', () => {
  it.each([
    ['qa:preflight', ['--files', 'apps/a.ts', 'docs/a.md', '--verbose']],
    ['qa:build', ['--proof']],
    ['qa:closeout', ['-m', 'chore: proof']],
    ['qa:audit', ['--profile', 'security']],
    ['qa:e2e', ['--suite=critical', '--headed']],
  ])('parses declared arguments for %s', (wrapperId, argv) => {
    expect(() => parseWrapperArguments(wrapperId, argv)).not.toThrow();
  });

  it.each(Object.keys(QA_WRAPPER_CLI_CONTRACTS))(
    'rejects unknown arguments and supports help for %s',
    (wrapperId) => {
      expect(() => parseWrapperArguments(wrapperId, ['--typo'])).toThrow(/Unknown argument/u);
      const result = parseWrapperArguments(wrapperId, ['--help']);
      expect(result.values.help).toBe(true);
      expect(result.help).toContain(`Usage: ${QA_WRAPPER_CLI_CONTRACTS[wrapperId].usage}`);
    }
  );

  it('rejects duplicates and missing values', () => {
    expect(() => parseWrapperArguments('qa:e2e', ['--suite'])).toThrow(/Missing value/u);
    expect(() => parseWrapperArguments('qa:build', ['--proof', '--proof'])).toThrow(/Duplicate/u);
    expect(() => parseWrapperArguments('qa:closeout', ['-m', '--help'])).toThrow(/Missing value/u);
  });
});
