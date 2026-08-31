import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  peekUnifiedAstGrepReceipt,
  runUnifiedAstGrepReceipt,
  takeUnifiedAstGrepAuditReceipt,
} from './unified-ast-grep.mjs';
import {
  AST_GREP_CONFIG_PATH,
  AST_GREP_RULE_PATH,
  createAstGrepIdentity,
  projectAstGrepReceipt,
  runAstGrepCheck,
} from './ast-grep.mjs';
import { AST_GREP_CORE_GROUP_IDS, selectAstGrepPolicies } from './ast-grep.rules.mjs';

it('binds the unified receipt to the single project configuration', () => {
  expect(AST_GREP_CONFIG_PATH).toBe('tooling/configs/qa/ast-grep/sgconfig.yml');
  expect(AST_GREP_RULE_PATH).toBe('tooling/configs/qa/ast-grep/rules/core.yml');
});

it('keeps every migrated policy identity in executable YAML', () => {
  const rules = fs
    .readFileSync(AST_GREP_RULE_PATH, 'utf8')
    .split(/^---$/mu)
    .map((document) => ({
      id: /^id:\s*(.+)$/mu.exec(document)?.[1],
      pattern: /^\s{2}pattern:\s*(.+)$/mu.exec(document)?.[1],
    }));
  const policies = selectAstGrepPolicies(AST_GREP_CORE_GROUP_IDS);

  expect(rules.map(({ id }) => id)).toEqual(policies.map(({ rule }) => rule));
});

it('runs the checked-in YAML through the pinned native engine', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-ast-grep-yaml-'));
  const file = path.join(root, 'fixture.ts');
  fs.writeFileSync(file, 'chrome.runtime.sendMessage({ type: "PING" });\n');
  try {
    expect(runAstGrepCheck({ files: [file], groupIds: ['messaging'] }).violations).toEqual([
      expect.objectContaining({ rule: 'messaging-direct-send', line: 1 }),
    ]);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

it('executes every admitted syntax group in one process receipt', () => {
  const files = ['tooling/qa/audits/ast-grep/unified-ast-grep.mjs'];
  const runner = vi.fn(() => ({
    files,
    identity: createAstGrepIdentity({
      files,
      groupIds: AST_GREP_CORE_GROUP_IDS,
    }),
    skipped: false,
    violations: [
      {
        rule: 'messaging-direct-send',
        file: 'apps/extension/src/example.ts',
        line: 1,
      },
      {
        rule: 'browser-storage-direct',
        file: 'apps/extension/src/example.ts',
        line: 2,
      },
      {
        rule: 'design-system-direct-body-portal',
        file: 'apps/extension/src/example.tsx',
        line: 3,
      },
    ],
  }));
  const receipt = runUnifiedAstGrepReceipt({
    files,
    runner,
  });

  expect(runner).toHaveBeenCalledOnce();
  expect(runner).toHaveBeenCalledWith({
    files,
    groupIds: AST_GREP_CORE_GROUP_IDS,
  });
  expect(projectAstGrepReceipt(receipt, ['messaging']).violations).toHaveLength(1);
  expect(projectAstGrepReceipt(receipt, ['browser-adapters']).violations).toHaveLength(1);
  expect(projectAstGrepReceipt(receipt, ['design-system']).violations).toHaveLength(1);
  expect(peekUnifiedAstGrepReceipt()).toBe(receipt);
  expect(takeUnifiedAstGrepAuditReceipt()).toBe(receipt);
  expect(takeUnifiedAstGrepAuditReceipt()).toBeNull();
});

it('rejects a receipt after any bound identity component changes', () => {
  const files = ['tooling/qa/audits/ast-grep/unified-ast-grep.mjs'];
  const identity = createAstGrepIdentity({
    files,
    groupIds: AST_GREP_CORE_GROUP_IDS,
  });
  expect(() =>
    projectAstGrepReceipt(
      {
        files,
        identity: { ...identity, ruleDigest: '0'.repeat(64) },
        violations: [],
      },
      ['messaging']
    )
  ).toThrow('ast-grep receipt identity mismatch: ruleDigest');
});

it('moves design-system syntax prohibitions through the shared engine with canonical exemptions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-system-ast-grep-'));
  const invalidFile = path.join(root, 'apps/extension/src/content/raw-modal.tsx');
  const canonicalFile = path.join(root, 'packages/ui/src/product-modal/index.tsx');
  fs.mkdirSync(path.dirname(invalidFile), { recursive: true });
  fs.mkdirSync(path.dirname(canonicalFile), { recursive: true });
  fs.writeFileSync(
    invalidFile,
    [
      "import { Legacy } from '../../../shared/components';",
      'const modal = <div className="sniptale-modal" />;',
      'createPortal(modal, document.body);',
    ].join('\n')
  );
  fs.writeFileSync(
    canonicalFile,
    [
      'const modal = <div className={`sniptale-modal ${className}`} />;',
      'createPortal(modal, resolveThemePortalContainer());',
    ].join('\n')
  );
  try {
    const violations = runAstGrepCheck({
      files: [invalidFile, canonicalFile],
      groupIds: ['design-system'],
      pathRoot: root,
    }).violations;
    expect(violations).toHaveLength(3);
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'design-system-direct-body-portal',
          line: 3,
        }),
        expect.objectContaining({
          rule: 'design-system-legacy-import',
          line: 1,
        }),
        expect.objectContaining({
          rule: 'design-system-raw-family-class',
          line: 2,
        }),
      ])
    );
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

it('does not launch a process for an empty admitted scope', () => {
  const runner = vi.fn();
  expect(runUnifiedAstGrepReceipt({ files: [], runner })).toMatchObject({
    skipped: true,
    violations: [],
  });
  expect(runner).not.toHaveBeenCalled();
});

it('filters test files and canonical browser owners before creating the shared receipt', () => {
  const files = [
    'apps/extension/src/content/example.test.ts',
    'packages/platform/src/browser/runtime.ts',
    'apps/extension/src/content/example.ts',
  ];
  const runner = vi.fn(({ files: admittedFiles }) => ({
    files: admittedFiles,
    identity: createAstGrepIdentity({
      files: admittedFiles,
      groupIds: AST_GREP_CORE_GROUP_IDS,
    }),
    skipped: false,
    violations: [],
  }));

  runUnifiedAstGrepReceipt({ files, runner });

  expect(runner).toHaveBeenCalledWith({
    files: ['apps/extension/src/content/example.ts'],
    groupIds: AST_GREP_CORE_GROUP_IDS,
  });
});

it('rejects a skipped receipt that claims scope or findings', () => {
  expect(() =>
    projectAstGrepReceipt(
      {
        skipped: true,
        files: ['apps/extension/src/example.ts'],
        violations: [],
      },
      ['messaging']
    )
  ).toThrow('ast-grep skipped receipt cannot contain scope or findings');
});
