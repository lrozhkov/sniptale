import { expect, it } from 'vitest';

import {
  collectTopologyFragmentationReport,
  formatTopologyFragmentationConsole,
} from './check.mjs';
import { classifyTopologyChangeReason, decideTopologyCluster } from './policy.mjs';

type MetricOverrides = Record<string, unknown>;

function metric(file: string, overrides: MetricOverrides = {}) {
  return {
    file,
    lines: 20,
    exports: 1,
    architecturalLayer: 'default',
    stateAuthorities: 0,
    stateReceiverNames: [],
    stateReceiverKeys: [],
    unresolvedStateAuthorityCount: 0,
    effectFamilies: [],
    effectCount: 0,
    effectfulClusters: 0,
    classifiedCallCount: 0,
    cohesion: 1,
    score: 0,
    functions: [],
    ...overrides,
  };
}

function orchestrationFunction(overrides: MetricOverrides = {}) {
  return {
    profile: 'orchestration',
    score: 8,
    effectFamilies: ['persistence', 'messaging'],
    cyclomatic: 4,
    nesting: 2,
    cohesion: 0.9,
    ownerGroupCount: 2,
    recoveryPressure: 2,
    ...overrides,
  };
}

function collect(
  sources: Record<string, string>,
  metrics: ReturnType<typeof metric>[],
  advisories: Array<{ file: string }> = []
) {
  const readFile = (file: string) => {
    if (!(file in sources)) throw new Error(`Missing fixture ${file}`);
    return sources[file];
  };
  return collectTopologyFragmentationReport({
    files: metrics.map((item) => item.file),
    structuralReport: { files: metrics, functions: [], violations: [], advisories },
    root: '/unused',
    readFile,
  });
}

it('uses the canonical change-reason precedence', () => {
  const publicFiles = new Set(['owner/public.ts']);
  const cases = [
    ['owner/public.test.ts', metric('owner/public.test.ts'), 'test-proof'],
    ['owner/public.ts', metric('owner/public.ts'), 'contract'],
    ['owner/types.ts', metric('owner/types.ts'), 'contract'],
    [
      'owner/adapter.ts',
      metric('owner/adapter.ts', { architecturalLayer: 'adapter' }),
      'effect-adapter',
    ],
    [
      'owner/workflow.ts',
      metric('owner/workflow.ts', { functions: [orchestrationFunction({ score: 0 })] }),
      'orchestration',
    ],
    ['owner/view.tsx', metric('owner/view.tsx', { architecturalLayer: 'ui' }), 'ui'],
    ['owner/state.ts', metric('owner/state.ts', { stateAuthorities: 1 }), 'state'],
    ['owner/effect.ts', metric('owner/effect.ts', { effectCount: 1 }), 'effect-adapter'],
    ['owner/getter.ts', metric('owner/getter.ts'), 'facade-proxy'],
    ['owner/fixture.ts', metric('owner/fixture.ts'), 'data'],
    ['owner/service.ts', metric('owner/service.ts'), 'default'],
  ] as const;

  for (const [file, fileMetric, expected] of cases) {
    expect(classifyTopologyChangeReason(file, fileMetric, publicFiles)).toBe(expected);
  }
});

it('keeps the approved decision precedence for mixed and unresolved protected clusters', () => {
  const context = {
    publicFiles: new Set(),
    moduleByFile: new Map(),
    productionIncoming: new Map(),
  };
  const base = {
    fileMetrics: [],
    effectFamilies: [],
    stateMutationFiles: 0,
    changeReasons: [],
    cohesion: 1,
    lexicalStateReceivers: [],
    lexicalStateReceiverKeys: [],
    unresolvedEdges: 0,
    unresolvedStateAuthorities: 0,
    reExportCycle: false,
    provenPublicContractFiles: [],
    signals: {
      forwardingOnlyFiles: 0,
      passThroughFiles: 0,
      proxyFamilyFiles: 0,
      singleConsumerSmallFiles: 0,
      delegationOnlyTests: 0,
      facadeDepth: 0,
    },
    fileDetails: [],
  };

  expect(
    decideTopologyCluster(
      {
        ...base,
        effectFamilies: ['dom-ui', 'persistence'],
        stateMutationFiles: 2,
        provenPublicContractFiles: ['owner/public.ts'],
      },
      context
    )
  ).toMatchObject({ decision: 'Split', confidence: 'medium' });
  expect(
    decideTopologyCluster(
      { ...base, unresolvedEdges: 1, provenPublicContractFiles: ['owner/public.ts'] },
      context
    )
  ).toMatchObject({
    decision: 'Keep',
    confidence: 'low',
    reasons: ['unresolved-topology-or-authority'],
  });
});

it('keeps proof-only delegation evidence out of consolidation decisions', () => {
  const core = 'owner/core.ts';
  const helper = 'owner/helper.ts';
  const context = {
    publicFiles: new Set<string>(),
    moduleByFile: new Map([
      [core, { forwardingOnly: false }],
      [helper, { forwardingOnly: false }],
    ]),
    productionIncoming: new Map([
      [core, new Set(['owner/a.ts', 'owner/b.ts'])],
      [helper, new Set(['owner/a.ts'])],
    ]),
  };
  const decision = decideTopologyCluster(
    {
      fileMetrics: [],
      effectFamilies: [],
      stateMutationFiles: 0,
      changeReasons: ['default'],
      cohesion: 1,
      lexicalStateReceiverKeys: [],
      unresolvedEdges: 0,
      unresolvedStateAuthorities: 0,
      reExportCycle: false,
      productionToProofEdges: 0,
      provenPublicContractFiles: [],
      signals: {
        forwardingOnlyFiles: 2,
        passThroughFiles: 0,
        proxyFamilyFiles: 0,
        singleConsumerSmallFiles: 3,
        delegationOnlyTests: 2,
        facadeDepth: 0,
      },
      fileDetails: [
        { file: core, reason: 'default' },
        { file: helper, reason: 'default' },
      ],
    },
    context
  );

  expect(decision).toMatchObject({
    decision: 'Keep',
    confidence: 'low',
    reasons: ['insufficient-corroborated-evidence'],
  });
});

it('partitions every file once and consolidates only corroborated one-owner fragmentation', () => {
  const sources = {
    'tooling/demo/owner/core.ts': 'export function run() { return true; }',
    'tooling/demo/owner/getter.ts': "export { run } from './core';",
    'tooling/demo/owner/setter.ts': "export { run } from './core';",
    'tooling/demo/owner/refs.ts': "import { run } from './core'; export const ref = () => run();",
    'tooling/quiet/owner/only.ts': 'export const only = true;',
  };
  const metrics = Object.keys(sources).map((file) => metric(file));
  const report = collect(sources, metrics);
  const cluster = report.clusters.find((candidate) => candidate.id === 'tooling/demo/owner');

  expect(report.partitionedFiles).toBe(metrics.length);
  expect(report.summary.totalClusters).toBe(2);
  expect(cluster).toMatchObject({
    decision: 'Consolidate',
    confidence: 'low',
    mergeTarget: 'tooling/demo/owner/core.ts',
  });
  expect(cluster?.reasons).toEqual(['forwarding', 'proxy-family']);
  expect(report.clusters.some((candidate) => candidate.id === 'tooling/quiet/owner')).toBe(false);
});

it('classifies single-consumer forwarding edges with explicit safety vetoes', () => {
  const sources = {
    'apps/extension/src/content/overlay/demo/consumer.ts':
      "import { run } from './facade'; export const result = run();",
    'apps/extension/src/content/overlay/demo/facade.test.ts':
      "import { run } from './facade'; it('runs', () => expect(run()).toBe(true));",
    'apps/extension/src/content/overlay/demo/facade.test-support.ts':
      "import { run } from './facade'; export const runFixture = run;",
    'apps/extension/src/content/overlay/demo/fixtures/facade.ts':
      "import { run } from '../facade'; export const fixtureResult = run();",
    'apps/extension/src/content/overlay/demo/facade.ts': "export { run } from './run';",
    'apps/extension/src/content/overlay/demo/run.ts': 'export function run() { return true; }',
    'apps/extension/src/content/overlay/cross-owner/consumer.ts':
      "import { parse } from '../../parser/demo/facade'; export const parsed = parse();",
    'apps/extension/src/content/parser/demo/facade.ts': "export { parse } from './parse';",
    'apps/extension/src/content/parser/demo/parse.ts': 'export function parse() { return true; }',
    'apps/extension/src/content/selection/demo/index.tsx':
      "import type { Props } from './types'; export const View = (_props: Props) => null;",
    'apps/extension/src/content/selection/demo/source.ts': 'export type Props = { label: string };',
    'apps/extension/src/content/selection/demo/types.ts': "export type { Props } from './source';",
  };
  const report = collect(
    sources,
    Object.keys(sources).map((file) => metric(file))
  );
  const edges = report.clusters.filter((cluster) => cluster.clusterKind === 'forwarding-edge');

  expect(report.summary.forwardingEdgeCandidates).toBe(3);
  expect(edges).toHaveLength(3);
  expect(
    edges.find((cluster) =>
      cluster.forwardingFiles.includes('apps/extension/src/content/overlay/demo/facade.ts')
    )
  ).toMatchObject({
    decision: 'Consolidate',
    confidence: 'medium',
    mergeTarget: 'apps/extension/src/content/overlay/demo/consumer.ts',
    reasons: ['forwarding', 'single-production-consumer'],
  });
  expect(
    edges.find((cluster) =>
      cluster.forwardingFiles.includes('apps/extension/src/content/parser/demo/facade.ts')
    )
  ).toMatchObject({
    decision: 'Consolidate',
    confidence: 'medium',
    mergeTarget: 'apps/extension/src/content/overlay/cross-owner/consumer.ts',
    reasons: ['forwarding', 'single-production-consumer'],
  });
  expect(
    edges.find((cluster) =>
      cluster.forwardingFiles.includes('apps/extension/src/content/selection/demo/types.ts')
    )
  ).toMatchObject({
    decision: 'Consolidate',
    confidence: 'medium',
    mergeTarget: 'apps/extension/src/content/selection/demo/index.tsx',
    reasons: ['forwarding', 'single-production-consumer'],
  });
});

it('keeps a forwarding edge that reaches proof code from production', () => {
  const root = 'apps/extension/src/content/selection/proof-forwarding';
  const sources = {
    [`${root}/consumer.ts`]: "import { run } from './facade'; export const result = run();",
    [`${root}/facade.ts`]: "export { run } from './run'; export { fixture } from './fixture.test';",
    [`${root}/fixture.test.ts`]: 'export const fixture = true;',
    [`${root}/run.ts`]: 'export function run() { return true; }',
  };
  const report = collect(
    sources,
    Object.keys(sources).map((file) => metric(file))
  );
  const edge = report.clusters.find(
    (cluster) =>
      cluster.clusterKind === 'forwarding-edge' &&
      cluster.forwardingFiles.includes(`${root}/facade.ts`)
  );

  expect(edge).toMatchObject({
    decision: 'Keep',
    confidence: 'low',
    reasons: ['production-to-proof-dependency'],
    productionToProofEdges: 1,
  });
});

it('resolves forwarding ladders to a stable non-forwarding merge target', () => {
  const sources = {
    'apps/extension/src/content/selection/demo/actions.ts':
      "import { run } from './selection'; export const result = run();",
    'apps/extension/src/content/selection/demo/selection.ts': "export { run } from './frame';",
    'apps/extension/src/content/selection/demo/frame.ts': "export { run } from './run';",
    'apps/extension/src/content/selection/demo/run.ts': 'export function run() { return true; }',
  };
  const report = collect(
    sources,
    Object.keys(sources).map((file) => metric(file))
  );
  const frame = report.clusters.find(
    (cluster) =>
      cluster.clusterKind === 'forwarding-edge' &&
      cluster.forwardingFiles.includes('apps/extension/src/content/selection/demo/frame.ts')
  );

  expect(frame).toMatchObject({
    decision: 'Consolidate',
    mergeTarget: 'apps/extension/src/content/selection/demo/actions.ts',
  });
});

it('keeps forwarding ladders without a stable non-forwarding target', () => {
  const sources = {
    'apps/extension/src/content/overlay/branch/facade.ts': "export { run } from './run';",
    'apps/extension/src/content/overlay/branch/bridge.ts': "export { run } from './facade';",
    'apps/extension/src/content/overlay/branch/first.ts':
      "import { run } from './bridge'; export const first = run();",
    'apps/extension/src/content/overlay/branch/second.ts':
      "import { run } from './bridge'; export const second = run();",
    'apps/extension/src/content/overlay/branch/run.ts': 'export function run() { return true; }',
    'apps/extension/src/content/overlay/cycle/a.ts': "export { value } from './b';",
    'apps/extension/src/content/overlay/cycle/b.ts': "export { value } from './a';",
    'apps/extension/src/content/overlay/cross/facade.ts': "export { run } from './run';",
    'apps/extension/src/content/overlay/cross/bridge.ts': "export { run } from './facade';",
    'apps/extension/src/content/overlay/cross/run.ts': 'export function run() { return true; }',
    'apps/extension/src/content/parser/cross/consumer.ts':
      "import { run } from '../../overlay/cross/bridge'; export const result = run();",
  };
  const report = collect(
    sources,
    Object.keys(sources).map((file) => metric(file))
  );
  const edge = (file: string) =>
    report.clusters.find(
      (cluster) =>
        cluster.clusterKind === 'forwarding-edge' && cluster.forwardingFiles.includes(file)
    );

  expect(edge('apps/extension/src/content/overlay/branch/facade.ts')).toMatchObject({
    decision: 'Keep',
    mergeTarget: null,
    mergeTargetBlockReason: 'multiple-production-consumers',
    reasons: ['unresolved-forwarding-target'],
  });
  expect(edge('apps/extension/src/content/overlay/cycle/a.ts')).toMatchObject({
    decision: 'Keep',
    mergeTarget: null,
    mergeTargetBlockReason: 'forwarding-cycle',
    reasons: ['unresolved-forwarding-target'],
  });
  expect(edge('apps/extension/src/content/overlay/cross/facade.ts')).toMatchObject({
    decision: 'Consolidate',
    mergeTarget: 'apps/extension/src/content/parser/cross/consumer.ts',
    mergeTargetBlockReason: null,
    reasons: ['forwarding', 'single-production-consumer'],
  });
});

it('keeps nested change-reason owners separate from unrelated adapter boundaries', () => {
  const sources = {
    'apps/extension/src/content/demo/owner/operation/core.ts':
      'export function run() { return true; }',
    'apps/extension/src/content/demo/owner/operation/getter.ts': "export { run } from './core';",
    'apps/extension/src/content/demo/owner/operation/setter.ts': "export { run } from './core';",
    'apps/extension/src/content/demo/owner/operation/refs.ts':
      "import { run } from './core'; export const ref = () => run();",
    'apps/extension/src/content/demo/owner/transport/adapter.ts':
      'export function send() { return true; }',
  };
  const metrics = Object.keys(sources).map((file) =>
    metric(file, file.endsWith('/transport/adapter.ts') ? { architecturalLayer: 'adapter' } : {})
  );
  const report = collect(sources, metrics);

  expect(report.summary.totalClusters).toBe(2);
  expect(
    report.clusters.find((cluster) => cluster.id.endsWith('/demo/owner/operation'))
  ).toMatchObject({
    decision: 'Consolidate',
    mergeTarget: 'apps/extension/src/content/demo/owner/operation/core.ts',
  });
  expect(report.clusters.some((cluster) => cluster.id.endsWith('/demo/owner/transport'))).toBe(
    false
  );
});

it('vetoes consolidation for independent same-spelling lexical authorities', () => {
  const sources = {
    'tooling/weak/owner/core.ts': 'export const core = true;',
    'tooling/weak/owner/getter.ts': "export { core } from './core';",
    'tooling/weak/owner/setter.ts': "export { core } from './core';",
    'tooling/weak/owner/refs.ts': "import { core } from './core'; export const ref = () => core;",
  };
  const metrics = Object.keys(sources).map((file) =>
    metric(
      file,
      file.endsWith('core.ts')
        ? {
            stateAuthorities: 3,
            stateReceiverNames: ['session'],
            stateReceiverKeys: ['session@10', 'session@20', 'session@30'],
          }
        : {}
    )
  );
  const report = collect(sources, metrics);

  expect(report.clusters[0]).toMatchObject({ decision: 'Keep', confidence: 'low' });
  expect(report.clusters[0].reasons).toEqual(['insufficient-corroborated-evidence']);
});

it('splits evidenced mixed UI/effect/state ownership but not structural score alone', () => {
  const sources = {
    'apps/extension/src/content/mixed/ui.tsx': 'export const View = () => null;',
    'apps/extension/src/content/mixed/store.ts': 'export const store = {};',
    'apps/extension/src/content/mixed/transport.ts': 'export const send = () => true;',
    'tooling/score/owner/high.ts': 'export const high = true;',
  };
  const metrics = [
    metric('apps/extension/src/content/mixed/ui.tsx', {
      architecturalLayer: 'ui',
      stateAuthorities: 1,
      stateReceiverNames: ['session'],
      effectFamilies: ['dom-ui'],
      effectCount: 1,
    }),
    metric('apps/extension/src/content/mixed/store.ts', {
      stateAuthorities: 1,
      stateReceiverNames: ['session'],
      effectFamilies: ['persistence'],
      effectCount: 1,
    }),
    metric('apps/extension/src/content/mixed/transport.ts', {
      effectFamilies: ['messaging'],
      effectCount: 1,
    }),
    metric('tooling/score/owner/high.ts', { score: 8, lines: 900 }),
  ];
  const structuralReport = {
    files: metrics,
    functions: [],
    violations: [],
    advisories: [{ file: 'tooling/score/owner/high.ts' }],
  };
  const readFile = (file: string) => sources[file as keyof typeof sources];
  const report = collectTopologyFragmentationReport({
    files: Object.keys(sources),
    structuralReport,
    root: '/unused',
    readFile,
  });

  expect(report.clusters.find((cluster) => cluster.id.endsWith('/mixed'))).toMatchObject({
    decision: 'Split',
    confidence: 'medium',
  });
  expect(report.clusters.find((cluster) => cluster.id === 'tooling/score/owner')).toMatchObject({
    decision: 'Keep',
    confidence: 'low',
  });
});

it('keeps proof-only state and persistence out of production topology decisions', () => {
  const root = 'apps/extension/src/content/selection/proof-only';
  const sources = {
    [`${root}/types.ts`]: 'export type Session = { active: boolean };',
    [`${root}/view.tsx`]: 'export const View = () => null;',
    [`${root}/view.test.ts`]:
      "import { View } from './view'; localStorage.setItem('fixture', String(View));",
    [`${root}/types.test.ts`]:
      "import type { Session } from './types'; export const fixture: Session = { active: true };",
  };
  const metrics = [
    metric(`${root}/types.ts`),
    metric(`${root}/view.tsx`, {
      architecturalLayer: 'ui',
      stateAuthorities: 1,
      stateReceiverNames: ['session'],
      stateReceiverKeys: ['session@10'],
      effectFamilies: ['dom-ui'],
      effectCount: 1,
      score: 5,
    }),
    metric(`${root}/view.test.ts`, {
      architecturalLayer: 'ui',
      stateAuthorities: 4,
      stateReceiverNames: ['fixture'],
      stateReceiverKeys: ['fixture@10'],
      effectFamilies: ['persistence'],
      effectCount: 1,
      score: 8,
    }),
    metric(`${root}/types.test.ts`, {
      stateAuthorities: 3,
      stateReceiverNames: ['fixture'],
      stateReceiverKeys: ['fixture@20'],
      effectFamilies: ['persistence'],
      effectCount: 1,
    }),
  ];
  const report = collect(sources, metrics, [{ file: `${root}/view.tsx` }]);
  const cluster = report.clusters.find((candidate) => candidate.id === root);

  expect(cluster).toMatchObject({
    decision: 'Keep',
    productionFileCount: 2,
    proofFileCount: 2,
    effectFamilies: ['dom-ui'],
    stateAuthorityPoints: 1,
    maximumStructuralScore: 5,
  });
  expect(cluster?.reasons).not.toContain('mixed-ui-effects-state');
  expect(cluster?.proofTransitions).toBeGreaterThan(0);
});

it('separates proof-importer edges and vetoes production imports of proof code', () => {
  const root = 'apps/extension/src/content/selection/proof-direction';
  const sources = {
    [`${root}/runtime.ts`]:
      "import { fixture } from './fixture.test'; export const result = fixture;",
    [`${root}/fixture.test.ts`]: "import { read } from './read'; export const fixture = read();",
    [`${root}/read.ts`]: 'export const read = () => true;',
  };
  const metrics = Object.keys(sources).map((file) => metric(file));
  const report = collect(sources, metrics, [{ file: `${root}/runtime.ts` }]);
  const cluster = report.clusters.find((candidate) => candidate.id === root);

  expect(cluster).toMatchObject({
    decision: 'Keep',
    confidence: 'low',
    reasons: ['production-to-proof-dependency'],
    productionFileCount: 2,
    proofFileCount: 1,
    productionToProofEdges: 1,
    navigationTransitions: 0,
    proofTransitions: 1,
  });
});

it('does not infer a public runtime contract from a proof-only cross-runtime import', () => {
  const testFile = 'apps/extension/src/content/selection/proof-contract/view.test.ts';
  const target = 'apps/extension/src/popup/proof-contract/internal.ts';
  const sources = {
    [testFile]: "import { internal } from '../../../popup/proof-contract/internal'; void internal;",
    [target]: 'export const internal = true;',
  };
  const metrics = Object.keys(sources).map((file) => metric(file));
  const report = collect(sources, metrics, [{ file: target }]);
  const cluster = report.clusters.find(
    (candidate) => candidate.id === 'apps/extension/src/popup/proof-contract'
  );

  expect(cluster?.provenPublicContractFiles).toEqual([]);
  expect(cluster?.decision).toBe('Keep');
});

it('preserves cohesive orchestration and proven contract boundaries', () => {
  const sources = {
    'apps/extension/src/content/workflow/run.ts': [
      "import './missing';",
      'export async function run() { return true; }',
    ].join('\n'),
    'packages/demo/src/public.ts': 'export const publicValue = true;',
    'packages/demo/package.json': JSON.stringify({ exports: { './public': './src/public.ts' } }),
  };
  const metrics = [
    metric('apps/extension/src/content/workflow/run.ts', {
      classifiedCallCount: 10,
      cohesion: 0.9,
      stateAuthorities: 3,
      stateReceiverNames: ['session'],
      stateReceiverKeys: ['session@10'],
      effectFamilies: ['persistence', 'messaging'],
      effectCount: 2,
      functions: [orchestrationFunction()],
      score: 8,
    }),
    metric('packages/demo/src/public.ts', { score: 6 }),
  ];
  const structuralReport = {
    files: metrics,
    functions: [],
    violations: [],
    advisories: metrics.map(({ file }) => ({ file })),
  };
  const report = collectTopologyFragmentationReport({
    files: metrics.map(({ file }) => file),
    structuralReport,
    root: '/unused',
    readFile: (file) => sources[file as keyof typeof sources],
  });

  expect(report.clusters.find((cluster) => cluster.id.endsWith('/workflow'))).toMatchObject({
    decision: 'Keep',
    confidence: 'high',
    reasons: ['cohesive-orchestration-owner'],
    unresolvedEdges: 1,
  });
  expect(report.clusters.find((cluster) => cluster.id === 'packages/demo/src')).toMatchObject({
    decision: 'Keep',
    confidence: 'high',
    reasons: ['proven-public-contract'],
  });
});

it('downgrades mixed-declaration re-export cycles and prints explicit summaries', () => {
  const sources = {
    'tooling/cycle/owner/a.ts': "export const a = true; export { b } from './b';",
    'tooling/cycle/owner/b.ts': "export const b = true; export { a } from './a';",
  };
  const report = collect(
    sources,
    Object.keys(sources).map((file) => metric(file))
  );

  expect(report.clusters[0]).toMatchObject({
    decision: 'Keep',
    confidence: 'low',
    reExportCycle: true,
  });
  expect(formatTopologyFragmentationConsole(report)).toContain('candidates=1');
  expect(
    formatTopologyFragmentationConsole({
      clusters: [],
      unresolvedEdges: 0,
      summary: { totalClusters: 0, candidateClusters: 0, split: 0, consolidate: 0, keep: 0 },
    })
  ).toContain('candidates=0, split=0, consolidate=0, keep=0');
});

it('keeps every decision family visible in a bounded console preview', () => {
  const clusters = ['Split', 'Consolidate', 'Keep'].flatMap((decision) =>
    Array.from({ length: 8 }, (_, index) => ({
      decision,
      confidence: 'medium',
      id: `${decision.toLowerCase()}-${index}`,
      fileCount: 2,
      navigationTransitions: 1,
      reasons: ['fixture'],
      maximumStructuralScore: 8 - index,
    }))
  );
  const output = formatTopologyFragmentationConsole(
    {
      clusters,
      unresolvedEdges: 0,
      summary: {
        totalClusters: clusters.length,
        candidateClusters: clusters.length,
        split: 8,
        consolidate: 8,
        keep: 8,
      },
    },
    { limit: 6 }
  );

  expect(output).toContain('Split/medium');
  expect(output).toContain('Consolidate/medium');
  expect(output).toContain('Keep/medium');
});
