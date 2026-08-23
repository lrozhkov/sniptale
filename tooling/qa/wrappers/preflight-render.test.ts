import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

import { renderPreflightReport } from './preflight.mjs';

it('renders deduplicated owner, structural, advisory, and proof sections', () => {
  const output = renderPreflightReport({
    context: { targetFiles: ['apps/extension/src/composition/persistence/storage/session.ts'] },
    relevantDocs: ['docs/agent-tooling/AGENTS.md'],
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
    structuralPressure: ['queue.ts: score=5, delta=3, cohesion=0.60'],
    contractChecklist: [],
    transitiveConsumerHints: [],
    typecheckBlastRadius: [],
    advisoryFindings: [
      {
        id: 'advisory.structural-file',
        file: 'session.ts',
        line: 12,
        family: 'Structural file pressure',
        hint: 'Keep the transaction boundary cohesive.',
        reason: 'dual truth risk',
        severity: 'watch',
      },
    ],
    proofHints: ['storage/settings seams need failure'],
  });

  expect(output).toContain('QA preflight: read-only context');
  expect(output).toContain('- extension:composition:persistence');
  expect(output).toContain('Additional structural context (findings excluded):');
  expect(output).toContain('score=5, delta=3');
  expect(output).toContain('queue.ts');
  expect(output).toContain('[advisory.structural-file] dual truth risk');
  expect(output).toContain('Hint: Keep the transaction boundary cohesive.');
  expect(output).not.toContain('Budget signals:');
});

it('renders behavioral wiring context collected by guardrail preflight', () => {
  const output = renderPreflightReport({
    context: { targetFiles: ['apps/extension/src/content/overlay/example/controller.ts'] },
    relevantDocs: [],
    ownerRuntime: [],
    guardrailReport: {
      hints: [
        'risk checklist: UI wiring: prove state, action, and lifecycle bindings behaviorally',
      ],
      buildScopeForecast: [],
    },
    structuralPressure: [],
    contractChecklist: [],
    transitiveConsumerHints: [],
    typecheckBlastRadius: [],
    advisoryFindings: [],
    proofHints: [],
  });

  expect(output).toContain(
    'risk checklist: UI wiring: prove state, action, and lifecycle bindings behaviorally'
  );
});

it('does not duplicate advisory reasons in the proof section', () => {
  const visualReason =
    'visual proof plan recommended: dialog.tsx changed; capture key open/closed states';
  const output = renderPreflightReport({
    context: { targetFiles: ['apps/extension/src/content/overlay/dialog.tsx'] },
    relevantDocs: [],
    ownerRuntime: [],
    guardrailReport: { hints: [visualReason], buildScopeForecast: [] },
    structuralPressure: [],
    contractChecklist: [],
    transitiveConsumerHints: [],
    typecheckBlastRadius: [],
    advisoryFindings: [
      {
        id: 'advisory.ui-proof-gap',
        file: 'apps/extension/src/content/overlay/dialog.tsx',
        hint: 'Capture representative visual states.',
        reason: visualReason,
        severity: 'watch',
      },
    ],
    proofHints: [],
  });

  expect(output.split(visualReason)).toHaveLength(2);
});

it('stays read-only and outside the blocking closeout path', () => {
  const source = ['preflight.mjs', 'preflight-render.mjs']
    .map((file) => fs.readFileSync(`tooling/qa/wrappers/${file}`, 'utf8'))
    .join('\n');
  for (const forbidden of [
    'runFormatterWrite',
    'writeAdvisoryState',
    'writeCheckpointState',
    'runNpm',
    'runCommand',
    'acquireBlockingWrapperLock',
  ]) {
    expect(source).not.toContain(forbidden);
  }
});

it('does not prescribe release harness for an inventory-only scope', () => {
  const output = renderPreflightReport({
    context: {
      targetFiles: [],
      harnessTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
      harnessInventoryTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
      harnessVerificationTargetFiles: [],
    },
    relevantDocs: [],
    ownerRuntime: [],
    guardrailReport: {},
    structuralPressure: [],
    contractChecklist: [],
    transitiveConsumerHints: [],
    typecheckBlastRadius: [],
    advisoryFindings: [],
    proofHints: [],
  });

  expect(output).toContain('data-only harness inventories use checkpoint owner validators');
  expect(output).toContain('qa:build still requires that fresh checkpoint');
  expect(output).not.toContain('run npm run qa:release-harness');
});

it('bounds large scope and boundary inventories without hiding later report sections', () => {
  const targetFiles = Array.from(
    { length: 114 },
    (_, index) => `apps/extension/src/content/selection/selection-mode/path-${index}.ts`
  );
  const digest = createHash('sha256').update(JSON.stringify(targetFiles)).digest('hex');
  const createReport = (files) =>
    renderPreflightReport({
      context: { mode: 'explicit-files', targetFiles: files },
      relevantDocs: ['docs/agent-tooling/AGENTS.md'],
      ownerRuntime: ['extension:content:selection'],
      guardrailReport: { buildScopeForecast: ['extension artifact build'] },
      structuralPressure: ['attention=0'],
      contractChecklist: [`runtime/import boundary files: ${files.join(', ')}`],
      transitiveConsumerHints: [],
      typecheckBlastRadius: [],
      advisoryFindings: [],
      proofHints: ['selection workflow proof'],
    });
  const output = createReport(targetFiles);

  expect(output).toContain(targetFiles[0]);
  expect(output).toContain(targetFiles.at(-1));
  expect(output).toContain(`Target files (114):`);
  expect(output).toContain(`full-list-sha256=${digest}`);
  expect(output).toContain('Proof:');
  expect(output).toContain('Build forecast:');
  expect(output).toContain('Non-blocking advisory findings:');
  expect(output).toContain('attention=0, watch=0');
  expect(output).not.toContain('console output truncated');
  expect(Buffer.byteLength(output)).toBeLessThan(16 * 1024);

  const changedMiddle = [...targetFiles];
  changedMiddle[50] = `${changedMiddle[50]}.changed`;
  expect(createReport(changedMiddle)).not.toContain(`full-list-sha256=${digest}`);
});
