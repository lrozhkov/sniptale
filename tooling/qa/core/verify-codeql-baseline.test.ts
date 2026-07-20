import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { runCodeqlCheck } from '../audits/codeql.mjs';
import { createTempRoot } from './test-helpers';

function finding(ruleId: string, file: string, line: number) {
  return {
    ruleId,
    message: { text: 'example finding' },
    locations: [
      { physicalLocation: { artifactLocation: { uri: file }, region: { startLine: line } } },
    ],
  };
}

function createCodeqlRunner(outputRoot: string, results: ReturnType<typeof finding>[]) {
  return (_command: string, args: string[]) => {
    if (args[1] === 'create') return { status: 0, stdout: '', stderr: '' };
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(
      path.join(outputRoot, 'results.sarif'),
      JSON.stringify({ version: '2.1.0', runs: [{ results }] })
    );
    return { status: 0, stdout: '', stderr: '' };
  };
}

function writeSource(root: string, content = 'export const value = 1;\n') {
  const filePath = path.join(root, 'src/shared/example.ts');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function baselineFinding(contentHash: string, overrides: Record<string, unknown> = {}) {
  return {
    debtId: 'noise.codeql.synthetic',
    rule: 'js/baselined',
    file: 'src/shared/example.ts',
    line: 9,
    contentHash,
    messageHash: 'e2649ecd63bc3ddc0140f7058c4a00df316d3f9263b2bc07409b1397609406f2',
    ...overrides,
  };
}

it('filters codeql test-like and constrained baseline findings', () => {
  const root = createTempRoot('verify-codeql-baseline-');
  const outputRoot = path.join(root, 'codeql');
  const baselinePath = path.join(root, 'codeql-baseline.json');
  const contentHash = writeSource(root);
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      findings: [baselineFinding(contentHash)],
    })
  );

  const result = runCodeqlCheck({
    baselinePath,
    executable: 'codeql',
    outputRoot,
    sourceRoot: root,
    runCommandImpl: createCodeqlRunner(outputRoot, [
      finding('js/test-only', 'src/shared/example.test.ts', 3),
      finding('js/baselined', 'src/shared/example.ts', 9),
      finding('js/new', 'src/shared/example.ts', 11),
    ]),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'js/new', file: 'src/shared/example.ts', line: 11 }),
  ]);
  expect(result.summaryText).toContain('Filtered test-like findings: 1');
  expect(result.summaryText).toContain('Constrained baseline findings: 1');
});

it('rejects untriaged codeql baseline entries', () => {
  const root = createTempRoot('verify-codeql-untriaged-baseline-');
  const outputRoot = path.join(root, 'codeql');
  const baselinePath = path.join(root, 'codeql-baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ findings: [{ rule: 'js/baselined', file: 'src/example.ts', line: 9 }] })
  );

  expect(() =>
    runCodeqlCheck({
      baselinePath,
      executable: 'codeql',
      outputRoot,
      runCommandImpl: (_command, args) => {
        if (args[1] === 'create') return { status: 0, stdout: '', stderr: '' };
        fs.mkdirSync(outputRoot, { recursive: true });
        fs.writeFileSync(
          path.join(outputRoot, 'results.sarif'),
          JSON.stringify({ version: '2.1.0', runs: [{ results: [] }] })
        );
        return { status: 0, stdout: '', stderr: '' };
      },
    })
  ).toThrow('CodeQL baseline entries require');
});

it('rejects registry-owned metadata duplicated into the codeql baseline', () => {
  const root = createTempRoot('verify-codeql-metadata-owner-');
  const outputRoot = path.join(root, 'codeql');
  const baselinePath = path.join(root, 'codeql-baseline.json');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      findings: [baselineFinding(writeSource(root), { classification: 'tool-noise' })],
    })
  );

  expect(() =>
    runCodeqlCheck({
      baselinePath,
      executable: 'codeql',
      outputRoot,
      sourceRoot: root,
      runCommandImpl: createCodeqlRunner(outputRoot, []),
    })
  ).toThrow('metadata belongs in the technical-debt registry');
});

it('does not suppress a changed finding message at the same rule, file, and line', () => {
  const root = createTempRoot('verify-codeql-message-drift-');
  const outputRoot = path.join(root, 'codeql');
  const baselinePath = path.join(root, 'codeql-baseline.json');
  const contentHash = writeSource(root);
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      findings: [baselineFinding(contentHash, { messageHash: '0'.repeat(64) })],
    })
  );

  const result = runCodeqlCheck({
    baselinePath,
    executable: 'codeql',
    outputRoot,
    sourceRoot: root,
    runCommandImpl: createCodeqlRunner(outputRoot, [
      finding('js/baselined', 'src/shared/example.ts', 9),
    ]),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'codeql-baseline-stale', line: 9 }),
    expect.objectContaining({ rule: 'js/baselined', line: 9 }),
  ]);
});

it('does not suppress the same finding after its source content changes', () => {
  const root = createTempRoot('verify-codeql-content-drift-');
  const outputRoot = path.join(root, 'codeql');
  const baselinePath = path.join(root, 'codeql-baseline.json');
  const contentHash = writeSource(root);
  fs.writeFileSync(path.join(root, 'src/shared/example.ts'), 'export const value = 2;\n');
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({
      findings: [baselineFinding(contentHash)],
    })
  );

  const result = runCodeqlCheck({
    baselinePath,
    executable: 'codeql',
    outputRoot,
    sourceRoot: root,
    runCommandImpl: createCodeqlRunner(outputRoot, [
      finding('js/baselined', 'src/shared/example.ts', 9),
    ]),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'codeql-baseline-content-drift', line: 9 }),
  ]);
});

it('blocks a disappeared baseline entry and accepts its exact reintroduction', () => {
  const root = createTempRoot('verify-codeql-disappearance-');
  const outputRoot = path.join(root, 'codeql');
  const baselinePath = path.join(root, 'codeql-baseline.json');
  const contentHash = writeSource(root);
  fs.writeFileSync(baselinePath, JSON.stringify({ findings: [baselineFinding(contentHash)] }));

  const disappeared = runCodeqlCheck({
    baselinePath,
    executable: 'codeql',
    outputRoot,
    sourceRoot: root,
    runCommandImpl: createCodeqlRunner(outputRoot, []),
  });
  const reintroduced = runCodeqlCheck({
    baselinePath,
    executable: 'codeql',
    outputRoot,
    sourceRoot: root,
    runCommandImpl: createCodeqlRunner(outputRoot, [
      finding('js/baselined', 'src/shared/example.ts', 9),
    ]),
  });

  expect(disappeared.violations).toEqual([
    expect.objectContaining({ rule: 'codeql-baseline-stale', line: 9 }),
  ]);
  expect(reintroduced.violations).toEqual([]);
  expect(reintroduced.summaryText).toContain('Constrained baseline findings: 1');
});
