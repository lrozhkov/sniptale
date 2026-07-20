import { afterEach, expect, it, vi } from 'vitest';

import { createSmellInventory, printTextReport } from './core.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

function expectAuditReportSections(report: string) {
  expect(report).toContain('Advisory scripts:\n');
  expect(report).toContain('- qa:advisory: verify-advisory.mjs\n');
  expect(report).toContain('Repo audit report tools:\n');
  expect(report).toContain('Smell families:\n');
  expect(report).toContain('- Hidden mutable module state: 2 hit(s) [src/shared/example.ts:1]\n');
  expect(report).toContain(
    [
      '- verify-interface-surfaces.mjs:',
      'node tooling/qa/core/verify-interface-surfaces.mjs --repo-wide --report-only\n',
    ].join(' ')
  );
}

function createAuditReportFixture() {
  return {
    repository: {
      trackedFileCount: 10,
      scale: 'small',
      repoLocalSkills: [],
      topDirectories: [],
    },
    hotspots: {
      baselineAllowanceCount: 0,
    },
    verification: {
      fullWrapperTools: [],
      focusedWrapperTools: [],
      focusedTriggerCoveredTools: [],
      fullOnlyTools: [],
      ownerScopedToolProof: [],
      qualityScripts: [],
      manualOnlyCheckScripts: [],
      advisoryScripts: [
        {
          script: 'qa:advisory',
          tool: 'verify-advisory.mjs',
        },
      ],
      repoAuditReportDefinitions: [
        {
          tool: 'verify-interface-surfaces.mjs',
          commands: [
            'node tooling/qa/core/verify-interface-surfaces.mjs --repo-wide --report-only',
          ],
        },
      ],
      skipCapableTools: [],
    },
    smellFamilies: [
      {
        family: 'Hidden mutable module state',
        count: 2,
        examples: ['src/shared/example.ts:1'],
      },
    ],
  };
}

it('prints advisory scripts in the human-readable audit report', () => {
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });

  printTextReport(createAuditReportFixture());

  expectAuditReportSections(writes.join(''));
});

it('retains every concrete smell finding while bounding family examples', () => {
  const findings = Array.from({ length: 4 }, (_, index) => ({
    family: 'Props-builder proliferation',
    file: `src/example-${index + 1}.ts`,
    line: index + 1,
    reason: `reason ${index + 1}`,
    hint: `hint ${index + 1}`,
    severity: 'watch',
  }));

  const inventory = createSmellInventory(findings, 10);

  expect(inventory.findings).toEqual(findings);
  expect(inventory.families).toEqual([
    {
      family: 'Props-builder proliferation',
      count: 4,
      examples: ['src/example-1.ts:1', 'src/example-2.ts:2', 'src/example-3.ts:3'],
    },
  ]);
});
