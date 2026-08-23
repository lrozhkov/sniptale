import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSecurityEslintConfig, lintWithSecurityEslint } from './eslint-security-adapter.mjs';
import { createTempRoot, withCwd, writeFile } from '../../core/test-helpers';

const RULE_FIXTURES = [
  {
    clean: 'const accessLevel = "user"; // ordinary left-to-right source\n',
    finding: `const accessLevel = "user"; // ${String.fromCodePoint(0x202e)} hidden direction\n`,
    ruleId: 'security/detect-bidi-characters',
    severity: 2,
  },
  {
    clean: 'buffer.readDoubleLE(0, false);\n',
    finding: 'buffer.readDoubleLE(0, true);\n',
    ruleId: 'security/detect-buffer-noassert',
    severity: 2,
  },
  {
    clean: 'eval("fixed source");\n',
    finding: 'eval(source);\n',
    ruleId: 'security/detect-eval-with-expression',
    severity: 2,
  },
  {
    clean: 'const value = new Buffer("fixed value");\n',
    finding: 'const value = new Buffer(size);\n',
    ruleId: 'security/detect-new-buffer',
    severity: 2,
  },
  {
    clean: 'const expression = new RegExp("fixed+");\n',
    finding: 'const expression = new RegExp(source);\n',
    ruleId: 'security/detect-non-literal-regexp',
    severity: 1,
  },
  {
    clean: 'const object = { fixed: value };\n',
    finding: 'const object = {}; object[key] = value;\n',
    ruleId: 'security/detect-object-injection',
    severity: 0,
  },
  {
    clean: 'const expression = /^\\d+$/;\n',
    finding: 'const expression = /(x+x+)+y/;\n',
    ruleId: 'security/detect-unsafe-regex',
    severity: 1,
  },
] as const;

function fixtureName(ruleId: string, kind: 'clean' | 'finding') {
  return `${ruleId.replace('security/detect-', '')}-${kind}.js`;
}

function writeRuleFixtures(root: string) {
  return RULE_FIXTURES.flatMap((fixture) =>
    (['clean', 'finding'] as const).map((kind) => {
      const file = fixtureName(fixture.ruleId, kind);
      writeFile(root, file, fixture[kind]);
      return file;
    })
  );
}

function messagesByFile(results: Awaited<ReturnType<typeof lintWithSecurityEslint>>['results']) {
  return new Map(
    results.map((result) => [
      path.basename(result.filePath),
      result.messages.map(({ ruleId, severity }) => ({ ruleId, severity })),
    ])
  );
}

describe('residual Security ESLint rule parity', () => {
  it('pins the exact configured severity of every residual security rule', () => {
    expect(createSecurityEslintConfig()[1]?.rules).toEqual(
      Object.fromEntries(
        RULE_FIXTURES.map(({ ruleId, severity }) => [
          ruleId,
          severity === 2 ? 'error' : severity === 1 ? 'warn' : 'off',
        ])
      )
    );
  });

  it('detects every enabled finding fixture and accepts every clean fixture', async () => {
    const root = createTempRoot('eslint-security-parity-');
    const files = writeRuleFixtures(root);

    const result = await withCwd(root, () =>
      lintWithSecurityEslint({ files, strictWarnings: true })
    );
    const actual = messagesByFile(result.results);

    for (const fixture of RULE_FIXTURES) {
      expect(actual.get(fixtureName(fixture.ruleId, 'clean'))).toBeUndefined();
      if (fixture.severity === 0) {
        expect(actual.get(fixtureName(fixture.ruleId, 'finding'))).toBeUndefined();
      } else {
        expect(actual.get(fixtureName(fixture.ruleId, 'finding'))).toEqual([
          { ruleId: fixture.ruleId, severity: fixture.severity },
        ]);
      }
    }

    expect(result).toMatchObject({ errorCount: 4, failed: true, warningCount: 2 });
  });

  it('blocks errors and unsafe regex in focused mode but defers other warnings', async () => {
    const root = createTempRoot('eslint-security-focused-');
    const files = writeRuleFixtures(root).filter((file) => file.endsWith('-finding.js'));

    const focused = await withCwd(root, () =>
      lintWithSecurityEslint({ files, strictWarnings: false })
    );
    const focusedMessages = messagesByFile(focused.results);

    expect(focused).toMatchObject({ errorCount: 4, failed: true, warningCount: 1 });
    expect(focusedMessages.get('non-literal-regexp-finding.js')).toBeUndefined();
    expect(focusedMessages.get('unsafe-regex-finding.js')).toEqual([
      { ruleId: 'security/detect-unsafe-regex', severity: 1 },
    ]);
  });

  it('blocks all configured warnings when strictWarnings is enabled', async () => {
    const root = createTempRoot('eslint-security-strict-');
    const files = writeRuleFixtures(root).filter((file) => file.endsWith('-finding.js'));

    const strict = await withCwd(root, () =>
      lintWithSecurityEslint({ files, strictWarnings: true })
    );
    const strictMessages = messagesByFile(strict.results);

    expect(strict).toMatchObject({ errorCount: 4, failed: true, warningCount: 2 });
    expect(strictMessages.get('non-literal-regexp-finding.js')).toEqual([
      { ruleId: 'security/detect-non-literal-regexp', severity: 1 },
    ]);
    expect(strictMessages.get('unsafe-regex-finding.js')).toEqual([
      { ruleId: 'security/detect-unsafe-regex', severity: 1 },
    ]);
  });
});
