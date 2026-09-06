import { expect, it, vi } from 'vitest';

import {
  collectForwardingModuleDriftReport,
  createForwardingBaselineSource,
  parseRevisionNameStatus,
  resolveForwardingDriftScope,
  runForwardingModuleDriftCheck,
} from './check.mjs';

const forwarder = 'apps/extension/src/content/overlay/demo/facade.ts';
const consumer = 'apps/extension/src/content/overlay/demo/consumer.ts';
const target = 'apps/extension/src/content/overlay/demo/run.ts';

function collect(
  sources: Record<string, string>,
  {
    baseline = new Map<string, string | null>() as
      | Map<string, string | null>
      | ((file: string) => string | null),
    changedFiles = [forwarder],
    policy = { schemaVersion: 1, exemptions: [] },
    today = '2026-09-01',
  } = {}
) {
  return collectForwardingModuleDriftReport({
    allFiles: Object.keys(sources).filter((file) => /\.[cm]?[jt]sx?$/u.test(file)),
    baselineSource:
      typeof baseline === 'function' ? baseline : (file: string) => baseline.get(file) ?? null,
    changedFiles,
    policy,
    readFile: (file: string) => {
      if (!(file in sources)) throw new Error(`Missing fixture ${file}`);
      return sources[file];
    },
    root: '/unused',
    today,
  });
}

function sameOwnerSources() {
  return {
    [forwarder]: "export { run } from './run';",
    [consumer]: "import { run } from './facade'; export const result = run();",
    [target]: 'export function run() { return true; }',
  };
}

it('rejects a new or newly forwarding module with one production consumer', () => {
  const added = collect(sameOwnerSources());
  const transitioned = collect(sameOwnerSources(), {
    baseline: new Map([[forwarder, "export const owner = 'facade';"]]),
  });

  expect(added.violations).toEqual([
    expect.objectContaining({
      rule: 'new-single-consumer-forwarding-module',
      file: forwarder,
      consumer,
      navigationTransitions: 1,
    }),
  ]);
  expect(transitioned.violations).toEqual(added.violations);
});

it('leaves existing baseline forwarding debt outside the blocking scope', () => {
  const result = collect(sameOwnerSources(), {
    baseline: new Map([[forwarder, "export { run } from './run';"]]),
  });

  expect(result.violations).toEqual([]);
});

it('ignores zero, multiple, and test-only production consumer counts', () => {
  const noConsumer = collect({
    [forwarder]: "export { run } from './run';",
    [target]: 'export function run() { return true; }',
  });
  const multiple = collect({
    ...sameOwnerSources(),
    'apps/extension/src/content/overlay/demo/second.ts':
      "import { run } from './facade'; export const second = run();",
  });
  const testOnly = collect({
    [forwarder]: "export { run } from './run';",
    [target]: 'export function run() { return true; }',
    'apps/extension/src/content/overlay/demo/facade.test.ts':
      "import { run } from './facade'; it('runs', () => expect(run()).toBe(true));",
  });

  expect(noConsumer.violations).toEqual([]);
  expect(multiple.violations).toEqual([]);
  expect(testOnly.violations).toEqual([]);
});

it('records exact public and runtime-boundary Keep evidence as advisory', () => {
  const packageForwarder = 'packages/demo/src/public.ts';
  const packageResult = collect(
    {
      'packages/demo/package.json': JSON.stringify({
        exports: { './public': './src/public.ts' },
      }),
      [packageForwarder]: "export { run } from './run';",
      'packages/demo/src/consumer.ts':
        "import { run } from './public'; export const result = run();",
      'packages/demo/src/run.ts': 'export function run() { return true; }',
    },
    { changedFiles: [packageForwarder] }
  );
  const runtimeResult = collect({
    [forwarder]: "export { run } from './run';",
    [target]: 'export function run() { return true; }',
    'apps/extension/src/background/demo/consumer.ts':
      "import { run } from '../../content/overlay/demo/facade'; export const result = run();",
  });

  expect(packageResult.violations).toEqual([]);
  expect(packageResult.advisories).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('public-contract'),
      targetFiles: ['packages/demo/src/run.ts'],
    }),
  ]);
  expect(runtimeResult.violations).toEqual([]);
  expect(runtimeResult.advisories).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('runtime-boundary'),
      targetFiles: [target],
    }),
  ]);
});

it('accepts an exact manual Keep and rejects stale or mismatched records', () => {
  const exactEntry = {
    forwarder,
    consumer,
    reason: 'independent-change-reason',
    owner: 'content-overlay',
    evidence: 'Stable external shape for the owner.',
    removalCondition: 'Remove when the owner contract retires.',
    reviewBy: '2026-12-01',
  };
  const exact = collect(sameOwnerSources(), {
    policy: { schemaVersion: 1, exemptions: [exactEntry] },
  });
  const stale = collect(sameOwnerSources(), {
    policy: {
      schemaVersion: 1,
      exemptions: [{ ...exactEntry, reviewBy: '2026-08-31' }],
    },
  });
  const mismatch = collect(sameOwnerSources(), {
    policy: {
      schemaVersion: 1,
      exemptions: [{ ...exactEntry, consumer: 'apps/extension/src/content/other.ts' }],
    },
  });
  const invalidCalendarDate = collect(sameOwnerSources(), {
    policy: {
      schemaVersion: 1,
      exemptions: [{ ...exactEntry, reviewBy: '2026-99-99' }],
    },
  });

  expect(exact.violations).toEqual([]);
  expect(exact.advisories).toEqual([
    expect.objectContaining({
      message: expect.stringContaining('independent-change-reason'),
      targetFiles: [target],
    }),
  ]);
  expect(stale.violations).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: 'invalid-forwarding-exemption' })])
  );
  expect(mismatch.violations).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: 'stale-forwarding-exemption' })])
  );
  expect(invalidCalendarDate.violations).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: 'invalid-forwarding-exemption' })])
  );
});

it('requires unresolved-topology exemptions to match a live unresolved edge', () => {
  const entry = {
    forwarder,
    consumer,
    reason: 'unresolved-topology',
    owner: 'content-overlay',
    evidence: 'Generated target is absent during topology inspection.',
    removalCondition: 'Remove when the generated target is graph-visible.',
    reviewBy: '2026-12-01',
  };
  const unresolved = collect(
    {
      [forwarder]: "export { run } from './missing';",
      [consumer]: "import { run } from './facade'; export const result = run();",
    },
    { policy: { schemaVersion: 1, exemptions: [entry] } }
  );
  const resolved = collect(sameOwnerSources(), {
    policy: { schemaVersion: 1, exemptions: [entry] },
  });

  expect(unresolved.violations).toEqual([]);
  expect(resolved.violations).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: 'stale-forwarding-exemption' })])
  );
});

it('parses rename-aware committed ranges and preserves multi-commit CI baselines', () => {
  expect(parseRevisionNameStatus(`M\t${forwarder}\nR100\told.ts\tnew.ts\nD\tgone.ts\n`)).toEqual({
    changedFiles: [forwarder, 'gone.ts', 'new.ts'].sort(),
    lineage: new Map([['new.ts', 'old.ts']]),
    recordCount: 3,
  });
  const gitRunner = vi.fn(() => ({ stdout: `A\t${forwarder}\n` }));
  const scope = resolveForwardingDriftScope({
    env: { SNIPTALE_BASE_SHA: 'base', SNIPTALE_CANDIDATE_SHA: 'candidate' },
    gitRunner,
    resolveWorkspaceFiles: () => [],
    scope: 'repo-wide',
  });

  expect(gitRunner).toHaveBeenCalledWith([
    'diff',
    '--name-status',
    '--find-renames',
    'base',
    'candidate',
  ]);
  expect(scope).toMatchObject({ baselineRevision: 'base', candidateRevision: 'candidate' });
});

it('accepts deletion-only committed ranges as a real candidate diff', () => {
  const scope = resolveForwardingDriftScope({
    env: { SNIPTALE_BASE_SHA: 'base', SNIPTALE_CANDIDATE_SHA: 'candidate' },
    gitRunner: () => ({ stdout: 'D\tapps/extension/src/content/overlay/demo/removed.ts\n' }),
    resolveWorkspaceFiles: () => [],
    scope: 'repo-wide',
  });

  expect(scope.changedFiles).toEqual(['apps/extension/src/content/overlay/demo/removed.ts']);
});

it('classifies a repo-wide tooling-only range as repository state', () => {
  const result = runForwardingModuleDriftCheck({
    allFiles: [],
    files: ['tooling/qa/hooks/pre-push.mjs'],
    gitRunner: () => ({ stdout: '' }),
    policy: { schemaVersion: 1, exemptions: [] },
    readFile: () => '',
    root: '/unused',
    scope: 'repo-wide',
  });

  expect(result).toMatchObject({
    files: [],
    populationKind: 'repository-state',
    violations: [],
  });
});

it('analyzes a committed type change and fails closed on unsupported status records', () => {
  const scope = resolveForwardingDriftScope({
    env: { SNIPTALE_BASE_SHA: 'base', SNIPTALE_CANDIDATE_SHA: 'candidate' },
    gitRunner: () => ({ stdout: `T\t${forwarder}\n` }),
    resolveWorkspaceFiles: () => [],
    scope: 'repo-wide',
  });
  const baselineSource = createForwardingBaselineSource(scope, {
    headSourceResolver: vi.fn(() => null),
    revisionSourceResolver: vi.fn(() => "export const owner = 'facade';"),
  });
  const result = collect(sameOwnerSources(), {
    baseline: baselineSource,
    changedFiles: scope.changedFiles,
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'new-single-consumer-forwarding-module', file: forwarder }),
  ]);
  expect(() => parseRevisionNameStatus(`X\t${forwarder}\n`)).toThrow(/Unsupported/u);
  expect(() => parseRevisionNameStatus('R100\tonly-old.ts\n')).toThrow(/malformed/u);
});

it('uses workspace rename lineage to compare the candidate with the original HEAD source', () => {
  const gitRunner = vi
    .fn()
    .mockReturnValueOnce({ stdout: `R100\told.ts\t${forwarder}\n` })
    .mockReturnValueOnce({ stdout: '' });
  const scope = resolveForwardingDriftScope({
    files: [forwarder],
    gitRunner,
    resolveWorkspaceFiles: () => [],
  });
  const revisionSourceResolver = vi.fn(() => "export { run } from './run';");
  const baselineSource = createForwardingBaselineSource(scope, {
    headSourceResolver: vi.fn(() => null),
    revisionSourceResolver,
  });
  const result = collect(sameOwnerSources(), { baseline: baselineSource });

  expect(gitRunner).toHaveBeenNthCalledWith(1, ['diff', '--name-status', '--find-renames']);
  expect(gitRunner).toHaveBeenNthCalledWith(2, [
    'diff',
    '--cached',
    '--name-status',
    '--find-renames',
  ]);
  expect(revisionSourceResolver).toHaveBeenCalledWith('old.ts', 'HEAD');
  expect(result.violations).toEqual([]);
});

it('uses first-parent fallback for equal CI SHAs and fails closed on an empty range', () => {
  const gitRunner = vi.fn(() => ({ stdout: `A\t${forwarder}\n` }));
  resolveForwardingDriftScope({
    env: { SNIPTALE_BASE_SHA: 'candidate', SNIPTALE_CANDIDATE_SHA: 'candidate' },
    gitRunner,
    resolveWorkspaceFiles: () => [],
    scope: 'repo-wide',
  });
  expect(gitRunner).toHaveBeenCalledWith(expect.arrayContaining(['candidate^', 'candidate']));
  expect(() =>
    resolveForwardingDriftScope({
      env: {},
      gitRunner: () => ({ stdout: '' }),
      resolveWorkspaceFiles: () => [],
      scope: 'repo-wide',
    })
  ).toThrow(/empty/u);
});
