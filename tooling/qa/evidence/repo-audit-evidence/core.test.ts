import { afterEach, expect, it, vi } from 'vitest';

import { collectRepoAuditEvidence, createSmellInventory, printTextReport } from './core.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

function expectAuditReportSections(report: string) {
  expect(report).toContain('Advisory scripts:\n');
  expect(report).toContain('- qa:advisory: verify-advisory.mjs\n');
  expect(report).toContain('Repo audit report tools:\n');
  expect(report).toContain(
    '- Structural maintenance: npm run qa:structural-audit (manual-report-only)\n'
  );
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
    structuralMaintenance: {
      auditCommand: 'npm run qa:structural-audit',
      auditMode: 'manual-report-only',
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

it('keeps the collected evidence compatible with the audit artifact contract', () => {
  const evidence = collectRepoAuditEvidence({ rootDir: process.cwd(), topCount: 1 });

  expect(evidence.smellFindings).toEqual([]);
  expect(evidence.smellFamilies).toEqual([]);
});
