import { expect, it, vi } from 'vitest';

import {
  collectAdvisoryFindings,
  createDetachedThisAdvisoryFixtureRoot,
  createRuntimeAdvisoryFixtureRoot,
  createStructuralAdvisoryFixtureRoot,
} from './verify-advisory.test-support';
import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

it('rejects explicit file scopes because advisory is diff-only', async () => {
  const module = await import('./verify-advisory.mjs');

  expect(() =>
    module.runAdvisoryVerification({
      files: ['AGENTS.md', 'tooling/qa/core/verify-advisory.mjs'],
    })
  ).toThrow(/current uncommitted diff only/u);
});

it('discovers changed tracked and untracked files for advisory runs', async () => {
  const root = createTempRoot('verify-advisory-diff-');
  initGitRepo(root);
  writeFile(root, 'package.json', '{"name":"verify-advisory-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'tracked.ts', 'export const value = 2;\n');
  writeFile(root, 'untracked.ts', 'export const next = 3;\n');

  const result = await withCwd(root, async () => {
    const module =
      await importFresh<typeof import('./verify-advisory.mjs')>('./verify-advisory.mjs');
    return module.runAdvisoryVerification();
  });

  expect(result.targetFiles).toEqual(['tracked.ts', 'untracked.ts']);
  expect(result.codeFiles).toEqual(['tracked.ts', 'untracked.ts']);
  expect(result.untrackedFiles).toEqual(['untracked.ts']);
});

it('collects returned-bag, singleton, mutable-state, and props-builder advisory findings', async () => {
  const root = createStructuralAdvisoryFixtureRoot();
  const findings = await collectAdvisoryFindings(root, [
    'src/shared/example-service.ts',
    'apps/extension/src/editor/workspace/panel/controller.tsx',
  ]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ family: 'Shared singleton/service roots' }),
      expect.objectContaining({ family: 'Hidden mutable module state' }),
      expect.objectContaining({ family: 'Hidden mutable module state' }),
      expect.objectContaining({ family: 'Hidden mutable module state' }),
      expect.objectContaining({ family: 'Broad returned object surfaces' }),
      expect.objectContaining({ family: 'Props-builder proliferation' }),
    ])
  );
  expect(
    findings.filter(
      (finding) =>
        finding.family === 'Hidden mutable module state' && /SESSION_LABELS/u.test(finding.reason)
    )
  ).toHaveLength(1);
  expect(
    findings.filter((finding) => finding.family === 'Shared singleton/service roots')
  ).toHaveLength(1);
  expect(
    findings.filter(
      (finding) =>
        finding.family === 'Hidden mutable module state' && /STATIC_REGISTRY/u.test(finding.reason)
    )
  ).toHaveLength(0);
  expect(findings.filter((finding) => finding.file === 'src/shared/example-service.ts')).toEqual(
    expect.arrayContaining([expect.objectContaining({ severity: 'attention' })])
  );
});

it('collects orchestration, read-path drift, transport catalog, and stateful flow advisory findings', async () => {
  const root = createRuntimeAdvisoryFixtureRoot();
  const findings = await collectAdvisoryFindings(root, [
    'apps/extension/src/content/hooks/example-controller.ts',
    'apps/extension/src/composition/persistence/storage/example.ts',
    'apps/extension/src/content/runtime/transport.ts',
    'apps/extension/src/popup/shell/runtime/state.ts',
  ]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ family: 'Hidden orchestration in helpers/controllers' }),
      expect.objectContaining({ family: 'Read-path compat / normalization drift' }),
      expect.objectContaining({ family: 'Transport/command catalog pressure' }),
      expect.objectContaining({ family: 'Misleading read-safe / bootstrap naming' }),
      expect.objectContaining({ family: 'Lifecycle intent loss in reconnect/retry seams' }),
      expect.objectContaining({ family: 'Destructive async swap risk' }),
      expect.objectContaining({ family: 'Success/failure asymmetry' }),
    ])
  );
  expect(findings.filter((finding) => finding.family === 'Success/failure asymmetry')).toHaveLength(
    1
  );
  expect(
    findings.filter((finding) => finding.family === 'Destructive async swap risk')
  ).toHaveLength(1);
  expect(findings.find((finding) => /restartRecording/u.test(finding.reason))).toBeUndefined();
});

it('collects detached this-sensitive method findings from the current diff only', async () => {
  const root = createDetachedThisAdvisoryFixtureRoot();
  const findings = await collectAdvisoryFindings(root, ['apps/extension/src/popup/use-service.ts']);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        family: 'Detached this-sensitive methods',
        file: 'apps/extension/src/popup/use-service.ts',
        severity: 'attention',
      }),
    ])
  );
  expect(
    findings.every((finding) => finding.file === 'apps/extension/src/popup/use-service.ts')
  ).toBe(true);
});

it('flags broad UI diffs that risk capability loss without a proof matrix', async () => {
  const root = createTempRoot('verify-advisory-ui-proof-');
  const uiFiles = Array.from(
    { length: 6 },
    (_, index) => `apps/extension/src/editor/workspace/floating/toolbar-${index}.tsx`
  );
  for (const file of uiFiles) {
    writeFile(root, file, 'export function ToolbarController() { return null; }\n');
  }

  const findings = await collectAdvisoryFindings(root, uiFiles, uiFiles);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ family: 'Wide UI diff without proof matrix' }),
      expect.objectContaining({ family: 'UI visual proof plan' }),
      expect.objectContaining({ family: 'Capability loss risk' }),
    ])
  );
});

it('includes web-snapshot-viewer in UI advisory proof planning', async () => {
  const root = createTempRoot('verify-advisory-web-snapshot-viewer-');
  const uiFile = 'apps/extension/src/web-snapshot-viewer/shell/app/floating-toolbar.tsx';
  writeFile(root, uiFile, 'export function FloatingToolbarController() { return null; }\n');

  const findings = await collectAdvisoryFindings(root, [uiFile]);

  expect(findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ family: 'UI visual proof plan' })])
  );
});

it('keeps migrated preflight advisory printing out of focused and full wrappers', async () => {
  const focusedSource = await import('node:fs').then((fs) =>
    fs.readFileSync('tooling/qa/core/verify-focused.mjs', 'utf8')
  );
  const fullSource = await import('node:fs').then((fs) =>
    fs.readFileSync('tooling/qa/core/verify-all.mjs', 'utf8')
  );

  expect(focusedSource.includes('printFocusedGuardrailReport')).toBe(false);
  expect(fullSource.includes('printFocusedGuardrailReport')).toBe(false);
});

it('prints advisory check coverage so the wrapper explains what it inspects', async () => {
  const module = await import('./verify-advisory.report.helpers.mjs');
  const stdoutChunks: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  });

  module.printAdvisoryReport({
    preflightReport: {
      clusters: [],
      residualSeams: [],
      hints: [],
      deletedInternalAggregates: [],
      thinShells: [],
      ownerLocalProof: [],
      falsePublicSeams: [],
      pathAudits: [],
    },
    findings: [],
  });

  writeSpy.mockRestore();

  const output = stdoutChunks.join('');
  expect(output).toContain('Advisory checks:');
  expect(output).toContain('preflight structural hints');
  expect(output).toContain('broad returned object surfaces');
  expect(output).toContain('transport/command catalog pressure');
  expect(output).toContain('misleading read-safe / bootstrap naming');
  expect(output).toContain('destructive async swap risk');
  expect(output).toContain('detached this-sensitive method references');
  expect(output).toContain('wide UI diffs without proof matrix');
  expect(output).toContain('capability loss risk in command/toolbars');
  expect(output).toContain('Advisory heuristics: no smell hits in current diff');
});
