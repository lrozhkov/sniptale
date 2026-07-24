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
import { collectAdvisoryFindings as collectRawAdvisoryFindings } from './verify-advisory.collectors.helpers.mjs';

it('reuses a supplied structural report instead of recollecting structural findings', () => {
  const file = 'virtual/example.ts';
  const findings = collectRawAdvisoryFindings({
    codeFiles: [file],
    targetFiles: [file],
    structuralReport: {
      violations: [],
      advisories: [
        {
          rule: 'structural-function-risk',
          severity: 'watch',
          file,
          line: 3,
          symbol: 'run',
          reason: 'score=4, delta=0, delta-kind=move-only',
          remediationHint: 'Keep the cohesive owner.',
        },
      ],
    },
  });

  expect(findings).toContainEqual(
    expect.objectContaining({
      id: 'advisory.structural-function',
      file,
      reason: 'score=4, delta=0, delta-kind=move-only',
    })
  );
});

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

it('replaces legacy smell collectors with the machine-owned structural catalog', async () => {
  const root = createStructuralAdvisoryFixtureRoot();
  const findings = await collectAdvisoryFindings(root, [
    'src/shared/example-service.ts',
    'apps/extension/src/editor/workspace/panel/controller.tsx',
  ]);

  expect(findings.every((finding) => finding.id.startsWith('advisory.'))).toBe(true);
  expect(findings.map((finding) => finding.family)).not.toEqual(
    expect.arrayContaining([
      'Shared singleton/service roots',
      'Hidden mutable module state',
      'Broad returned object surfaces',
      'Props-builder proliferation',
    ])
  );
});

it('does not duplicate blocking lifecycle/read-path guards in advisory', async () => {
  const root = createRuntimeAdvisoryFixtureRoot();
  const findings = await collectAdvisoryFindings(root, [
    'apps/extension/src/content/hooks/example-controller.ts',
    'apps/extension/src/composition/persistence/storage/example.ts',
    'apps/extension/src/content/runtime/transport.ts',
    'apps/extension/src/popup/shell/runtime/state.ts',
  ]);

  expect(findings.map((finding) => finding.family)).not.toEqual(
    expect.arrayContaining([
      'Read-path compat / normalization drift',
      'Lifecycle intent loss in reconnect/retry seams',
      'Destructive async swap risk',
      'Success/failure asymmetry',
    ])
  );
});

it('collects detached this-sensitive method findings from the current diff only', async () => {
  const root = createDetachedThisAdvisoryFixtureRoot();
  const findings = await collectAdvisoryFindings(root, ['apps/extension/src/popup/use-service.ts']);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'advisory.detached-this-method',
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
      expect.objectContaining({ id: 'advisory.ui-proof-gap', severity: 'attention' }),
    ])
  );
  expect(findings).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'advisory.ui-proof-gap', severity: 'watch' }),
    ])
  );
  const wideFinding = findings.find(
    (finding) => finding.id === 'advisory.ui-proof-gap' && finding.severity === 'attention'
  );
  expect(wideFinding?.hint).toContain('state, action, and lifecycle bindings behaviorally');
  expect(wideFinding?.hint).not.toContain('visual states');
});

it('does not count deleted tests as broad UI proof', async () => {
  const root = createTempRoot('verify-advisory-deleted-ui-tests-');
  const uiFiles = Array.from(
    { length: 6 },
    (_, index) => `apps/extension/src/editor/workspace/floating/panel-${index}.ts`
  );
  for (const file of uiFiles) {
    writeFile(root, file, 'export function usePanelController() { return null; }\n');
  }
  const deletedTests = [
    'apps/extension/src/editor/workspace/floating/panel-a.test.ts',
    'apps/extension/src/editor/workspace/floating/panel-b.test.ts',
  ];

  const findings = await collectAdvisoryFindings(root, [...uiFiles, ...deletedTests]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'advisory.ui-proof-gap',
        reason: expect.stringContaining('6 UI/controller files changed with 0 changed test'),
        severity: 'attention',
      }),
    ])
  );
});

it('does not let a deleted test suppress capability-loss guidance', async () => {
  const root = createTempRoot('verify-advisory-deleted-capability-test-');
  const capabilityFile = 'apps/extension/src/editor/workspace/floating/tool-commands.tsx';
  const deletedTest = 'apps/extension/src/editor/workspace/floating/tool-commands.test.tsx';
  writeFile(root, capabilityFile, 'export function Toolbar() { return <button />; }\n');

  const findings = await collectAdvisoryFindings(root, [capabilityFile, deletedTest]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'advisory.ui-proof-gap',
        reason: expect.stringContaining('capability-loss risk'),
        severity: 'attention',
      }),
    ])
  );
});

it('includes web-snapshot-viewer in UI advisory proof planning', async () => {
  const root = createTempRoot('verify-advisory-web-snapshot-viewer-');
  const uiFile = 'apps/extension/src/web-snapshot-viewer/shell/app/floating-toolbar.tsx';
  writeFile(root, uiFile, 'export function FloatingToolbar() { return <button />; }\n');

  const findings = await collectAdvisoryFindings(root, [uiFile]);

  expect(findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'advisory.ui-proof-gap' })])
  );
});

it('uses behavioral context instead of visual advisory for state-only modal wiring', async () => {
  const root = createTempRoot('verify-advisory-state-only-modal-');
  const controllerFile = 'apps/extension/src/content/overlay/ai/modal/session/controller.ts';
  const testFile = 'apps/extension/src/content/overlay/ai/modal/session/controller.test.tsx';
  writeFile(root, controllerFile, 'export function useModalController() { return {}; }\n');
  writeFile(root, testFile, "it('binds state', () => {});\n");

  const findings = await collectAdvisoryFindings(root, [controllerFile, testFile]);

  expect(findings.filter((finding) => finding.id === 'advisory.ui-proof-gap')).toEqual([]);
});

it('keeps visual proof advisory for view-bearing modal changes', async () => {
  const root = createTempRoot('verify-advisory-view-modal-');
  const viewFile = 'apps/extension/src/content/overlay/ai/modal/shell/dialog.tsx';
  writeFile(root, viewFile, 'export function Dialog() { return <section />; }\n');

  const findings = await collectAdvisoryFindings(root, [viewFile]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'advisory.ui-proof-gap', severity: 'watch' }),
    ])
  );
});

it('does not request visual proof for callback-only JSX rewiring', async () => {
  const root = createTempRoot('verify-advisory-callback-only-jsx-');
  const viewFile = 'apps/extension/src/content/overlay/ai/modal/shell/dialog.tsx';
  initGitRepo(root);
  writeFile(
    root,
    viewFile,
    'export function Dialog({ setOpen }) { return <button onClick={() => setOpen(false)}>Close</button>; }\n'
  );
  runGit(root, 'add', viewFile);
  runGit(root, 'commit', '-m', 'initial view');
  writeFile(
    root,
    viewFile,
    'export function Dialog({ handleClose }) { return <button onClick={handleClose}>Close</button>; }\n'
  );

  const findings = await collectAdvisoryFindings(root, [viewFile]);

  expect(findings.filter((finding) => finding.id === 'advisory.ui-proof-gap')).toEqual([]);
});

it('keeps imperative render changes visible inside an event callback', async () => {
  const root = createTempRoot('verify-advisory-event-render-jsx-');
  const viewFile = 'apps/extension/src/content/overlay/ai/modal/shell/dialog.tsx';
  initGitRepo(root);
  writeFile(
    root,
    viewFile,
    'export function Dialog({ close }) { return <button onClick={() => close()}>Close</button>; }\n'
  );
  runGit(root, 'add', viewFile);
  runGit(root, 'commit', '-m', 'initial view');
  writeFile(
    root,
    viewFile,
    'export function Dialog({ close }) { return <button onClick={() => { ' +
      'close(); render(Confirmation()); }}>Close</button>; }\n'
  );

  const findings = await collectAdvisoryFindings(root, [viewFile]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'advisory.ui-proof-gap', severity: 'watch' }),
    ])
  );
});

it('keeps visual proof for presentation attribute changes', async () => {
  const root = createTempRoot('verify-advisory-presentation-jsx-');
  const viewFile = 'apps/extension/src/content/overlay/ai/modal/shell/dialog.tsx';
  initGitRepo(root);
  writeFile(
    root,
    viewFile,
    "export function Dialog() { return <section className='closed' />; }\n"
  );
  runGit(root, 'add', viewFile);
  runGit(root, 'commit', '-m', 'initial view');
  writeFile(root, viewFile, "export function Dialog() { return <section className='open' />; }\n");

  const findings = await collectAdvisoryFindings(root, [viewFile]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'advisory.ui-proof-gap', severity: 'watch' }),
    ])
  );
});

it('keeps visual proof advisory for imperative render changes without JSX', async () => {
  const root = createTempRoot('verify-advisory-imperative-render-');
  const viewFile = 'apps/extension/src/content/overlay/ai/modal/shell/render.ts';
  writeFile(root, viewFile, 'export function mount(root) { root.render(Dialog()); }\n');

  const findings = await collectAdvisoryFindings(root, [viewFile]);

  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'advisory.ui-proof-gap', severity: 'watch' }),
    ])
  );
});

it('does not treat JavaScript test JSX as a production view change', async () => {
  const root = createTempRoot('verify-advisory-jsx-test-');
  const testFile = 'apps/extension/src/content/overlay/ai/modal/shell/dialog.test.jsx';
  writeFile(root, testFile, 'export function Fixture() { return <section />; }\n');

  const findings = await collectAdvisoryFindings(root, [testFile]);

  expect(findings.filter((finding) => finding.id === 'advisory.ui-proof-gap')).toEqual([]);
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
    findings: [],
  });

  writeSpy.mockRestore();

  const output = stdoutChunks.join('');
  expect(output).toContain('Non-blocking advisory checks:');
  expect(output).toContain('structural file pressure');
  expect(output).toContain('structural function pressure');
  expect(output).toContain('UI proof gaps');
  expect(output).toContain('detached this-sensitive method references');
  expect(output).toContain('Advisory (non-blocking): attention=0, watch=0');
});

it('keeps the advisory catalog exact and separate from blocking guard IDs', async () => {
  const { ADVISORY_CATALOG } = await import('./advisory-catalog.data.mjs');
  const { QA_RULE_DEFINITIONS } = await import('./qa-steps/definitions.mjs');
  expect(Object.keys(ADVISORY_CATALOG).sort()).toEqual([
    'advisory.detached-this-method',
    'advisory.structural-file',
    'advisory.structural-function',
    'advisory.ui-proof-gap',
  ]);
  expect(QA_RULE_DEFINITIONS.map(({ id }) => id)).not.toEqual(
    expect.arrayContaining(Object.keys(ADVISORY_CATALOG))
  );
});
