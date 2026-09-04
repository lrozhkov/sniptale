import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeJson } from '../../test-support/test-helpers';

function okStep(label: string, consoleOutput?: string) {
  return {
    label,
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
    ...(consoleOutput ? { consoleOutput } : {}),
  };
}

it('renders structural watches only through the checkpoint advisory block', async () => {
  const root = createTempRoot('qa-checkpoint-output-');
  writeJson(root, 'tooling/configs/qa/quality-baseline.json', {
    schemaVersion: 2,
    rationales: [],
    allowances: [],
  });

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('../checkpoint.mjs')>(
      '../checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-output-test-run',
      executionContractAsserter: () => {},
      contextCollector: () => ({
        codeFiles: ['src/example.ts'],
        existingTargetFiles: ['src/example.ts'],
        fingerprint: 'same-diff',
        jsLikeFiles: ['src/example.ts'],
        targetFiles: ['src/example.ts'],
      }),
      formatStepCollector: () => okStep('Format'),
      advisoryStepCollector: () => okStep('Advisory report', 'Advisory: attention=0, watch=1\n'),
      focusedStepCollector: async () => [
        okStep('Structural risk', 'Structural risk: attention=0, watch=1\n'),
        okStep('Focused diagnostics', 'unique focused diagnostics\n'),
      ],
    });

    expect(result.steps.find((step) => step.label === 'Advisory report')).toMatchObject({
      consoleOutput: expect.stringContaining('No classified change seams detected'),
      stdout: expect.stringMatching(/No classified change seams detected[\s\S]*Advisory log:/u),
    });
    expect(result.steps.find((step) => step.label === 'Advisory report')?.consoleOutput).toContain(
      'Inspect the implementation against architecture and security review triggers'
    );
    expect(
      result.steps.find((step) => step.label === 'Advisory report')?.consoleOutput
    ).not.toContain('LOW');
    expect(result.steps.find((step) => step.label === 'Advisory report')?.consoleOutput).toContain(
      'Advisory: attention=0, watch=1'
    );
    expect(result.steps.find((step) => step.label === 'Structural risk')).not.toHaveProperty(
      'consoleOutput'
    );
    expect(result.steps.find((step) => step.label === 'Focused diagnostics')).toMatchObject({
      consoleOutput: 'unique focused diagnostics\n',
    });
    expect(result.changeRisk).toMatchObject({ level: null, seams: [] });
    expect(result.advisory).toEqual({ introduced: [], worsened: [], existing: [] });
  });
});
