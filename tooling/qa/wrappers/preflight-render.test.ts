import fs from 'node:fs';
import { expect, it } from 'vitest';

import { renderPreflightReport } from './preflight.mjs';

it('renders docs, clusters, budgets, advisory findings, and proof hints', () => {
  const output = renderPreflightReport({
    context: { targetFiles: ['apps/extension/src/composition/persistence/storage/session.ts'] },
    relevantDocs: ['AGENTS.md'],
    guardrailReport: {
      clusters: ['owner:shared=1'],
      topologyQuestions: [
        'owner seam/runtime boundary: confirm owner before editing',
        'next 2-3 growth vectors: verify the topology still holds',
      ],
      hints: [],
      residualSeams: [],
      deletedInternalAggregates: [],
      thinShells: [],
      ownerLocalProof: [],
      falsePublicSeams: [],
      pathAudits: [],
    },
    budgetRisks: ['session.ts: 260 lines'],
    advisoryFindings: [
      { file: 'session.ts', line: 12, family: 'State authority', reason: 'dual truth risk' },
    ],
    proofHints: ['storage/settings seams need failure'],
  });

  expect(output).toContain('QA preflight: read-only context');
  expect(output).toContain('- owner:shared=1');
  expect(output.indexOf('Topology first questions:')).toBeLessThan(
    output.indexOf('Budget signals:')
  );
  expect(output).toContain('next 2-3 growth vectors');
  expect(output).toContain('260 lines');
  expect(output).toContain('State authority: dual truth risk');
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
