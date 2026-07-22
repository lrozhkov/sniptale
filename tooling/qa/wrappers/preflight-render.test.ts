import fs from 'node:fs';
import { expect, it } from 'vitest';

import { renderPreflightReport } from './preflight.mjs';

it('renders deduplicated owner, structural, advisory, and proof sections', () => {
  const output = renderPreflightReport({
    context: { targetFiles: ['apps/extension/src/composition/persistence/storage/session.ts'] },
    relevantDocs: ['AGENTS.md'],
    ownerRuntime: ['extension:composition:persistence'],
    guardrailReport: {
      clusters: ['owner:shared=1'],
      topologyQuestions: [
        'owner seam/runtime boundary: confirm owner before editing',
        'next 2-3 growth vectors: verify the topology still holds',
      ],
      hints: [],
      deletedInternalAggregates: [],
      thinShells: [],
      ownerLocalProof: [],
      falsePublicSeams: [],
      pathAudits: [],
    },
    structuralPressure: ['session.ts: score=5, delta=3, cohesion=0.60'],
    contractChecklist: [],
    transitiveConsumerHints: [],
    typecheckBlastRadius: [],
    advisoryFindings: [
      {
        id: 'advisory.structural-file',
        file: 'session.ts',
        line: 12,
        family: 'Structural file pressure',
        reason: 'dual truth risk',
        severity: 'watch',
      },
    ],
    proofHints: ['storage/settings seams need failure'],
  });

  expect(output).toContain('QA preflight: read-only context');
  expect(output).toContain('- extension:composition:persistence');
  expect(output).toContain('Structural pressure:');
  expect(output).toContain('score=5, delta=3');
  expect(output).toContain('[advisory.structural-file] dual truth risk');
  expect(output).not.toContain('Budget signals:');
});

it('stays read-only and outside the blocking closeout path', () => {
  const source = ['preflight.mjs', 'preflight-render.mjs']
    .map((file) => fs.readFileSync(`tooling/qa/wrappers/${file}`, 'utf8'))
    .join('\n');
  for (const forbidden of [
    'runPrettierWrite',
    'writeAdvisoryState',
    'writeCheckpointState',
    'runNpm',
    'runCommand',
    'acquireBlockingWrapperLock',
  ]) {
    expect(source).not.toContain(forbidden);
  }
});
