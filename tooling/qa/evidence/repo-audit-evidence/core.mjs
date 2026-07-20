import fs from 'node:fs';
import path from 'node:path';

import {
  collectFileHeuristicFindings,
  compareFindings,
} from '../../core/verify-advisory.detectors.helpers.mjs';
import { collectAiLimitReport } from '../../core/ai-limit-utils.mjs';
import { runReturnedObjectSurfaceAdvisoryCheck } from '../../core/verify-interface-surfaces.return-bags.mjs';
import { QUALITY_BASELINE_PATH } from '../../core/quality.config.mjs';
import { collectCodeFiles, loadBaseline } from '../../core/shared.mjs';
import { collectRepositoryProfile } from './repository-profile.mjs';
import { collectVerificationProfile } from './verification-profile.mjs';

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function printListSection(title, items, formatItem = (item) => item) {
  process.stdout.write(`${title}:\n`);
  if (items.length === 0) {
    process.stdout.write('- none\n');
    return;
  }

  for (const item of items) {
    process.stdout.write(`- ${formatItem(item)}\n`);
  }
}

export function createSmellInventory(findings, topCount) {
  const findingsByFamily = new Map();

  for (const finding of findings) {
    const familyFindings = findingsByFamily.get(finding.family) ?? [];
    familyFindings.push(finding);
    findingsByFamily.set(finding.family, familyFindings);
  }

  return {
    findings: [...findings].sort(compareFindings),
    families: [...findingsByFamily.entries()]
      .map(([family, familyFindings]) => ({
        family,
        count: familyFindings.length,
        examples: [
          ...new Set(
            familyFindings.map(
              (finding) => `${finding.file}${finding.line ? `:${finding.line}` : ''}`
            )
          ),
        ].slice(0, Math.max(1, Math.min(topCount, 3))),
      }))
      .sort((left, right) => right.count - left.count || left.family.localeCompare(right.family)),
  };
}

function collectSmellInventory(codeFiles, topCount) {
  const returnedBagResult = runReturnedObjectSurfaceAdvisoryCheck({ scope: 'repo-wide' });
  return createSmellInventory(
    [
      ...returnedBagResult.advisories.map((advisory) => ({
        family: 'Broad returned object surfaces',
        file: advisory.file,
        line: advisory.line ?? null,
        reason: advisory.message,
        hint: 'Split the returned controller/state bag before the next feature lands here.',
        severity: 'attention',
      })),
      ...codeFiles.flatMap((file) => collectFileHeuristicFindings(file)),
    ],
    topCount
  );
}

export function collectRepoAuditEvidence({ rootDir = process.cwd(), topCount = 10 } = {}) {
  const root = path.resolve(rootDir);
  const packageJson = safeReadJson(path.join(root, 'package.json'));
  const validationManifest = safeReadJson(
    path.join(root, 'tooling/configs/qa/validation-manifest.json')
  );
  const baseline = loadBaseline();
  const codeFiles = collectCodeFiles();
  const aiReport = collectAiLimitReport(codeFiles);
  const { profile } = collectRepositoryProfile(root, topCount);
  const { verification, loopholes } = collectVerificationProfile(packageJson, validationManifest);
  const smellInventory = collectSmellInventory(codeFiles, topCount);

  return {
    generatedAt: new Date().toISOString(),
    repository: profile,
    hotspots: {
      scannedCodeFiles: codeFiles.length,
      baselineAllowanceCount: baseline.allowances.length,
      baselinePath: QUALITY_BASELINE_PATH,
      topLineHotspots: aiReport.lineHotspots.slice(0, topCount),
      topTokenHotspots: aiReport.tokenHotspots.slice(0, topCount),
    },
    verification,
    loopholes,
    smellFindings: smellInventory.findings,
    smellFamilies: smellInventory.families,
    recommendedAuditCommands: [
      'node tooling/qa/audits/evidence.mjs --json',
      'npm run qa:audit',
      'npm run qa:release-harness',
    ],
  };
}

function printWrapperCounts(verification) {
  process.stdout.write(`- Full wrapper tools: ${verification.fullWrapperTools.length}\n`);
  process.stdout.write(`- Focused always-run tools: ${verification.focusedWrapperTools.length}\n`);
  process.stdout.write(
    `- Focused trigger-covered tools: ${verification.focusedTriggerCoveredTools.length}\n`
  );
  const harnessCount = verification.harnessWrapperTools?.length ?? 0;
  const buildCount = verification.buildWrapperTools?.length ?? 0;
  const auditCount = verification.auditWrapperTools?.length ?? 0;
  process.stdout.write(
    `- Harness/build/audit tools: ${harnessCount}/${buildCount}/${auditCount}\n`
  );
}

export function printTextReport(evidence) {
  process.stdout.write('Repo audit evidence\n');
  process.stdout.write(
    `- Scale: ${evidence.repository.trackedFileCount} tracked files (${evidence.repository.scale})\n`
  );
  process.stdout.write(`- Repo-local skills: ${evidence.repository.repoLocalSkills.length}\n`);
  process.stdout.write(`- Baseline allowances: ${evidence.hotspots.baselineAllowanceCount}\n`);
  printWrapperCounts(evidence.verification);
  printListSection(
    'Top directories',
    evidence.repository.topDirectories,
    (entry) => `${entry.directory}: ${entry.files} files`
  );
  printListSection(
    'Focused trigger-covered tools',
    evidence.verification.focusedTriggerCoveredTools
  );
  printListSection('Focused blind spots', evidence.verification.fullOnlyTools);
  printListSection(
    'Lane-scoped owner proof',
    evidence.verification.ownerScopedToolProof,
    (entry) => `${entry.tool} (${entry.lane}): ${entry.testFiles.join(', ')}`
  );
  printListSection(
    'Manual-only check scripts',
    evidence.verification.manualOnlyCheckScripts,
    (entry) => `${entry.script}: ${entry.tool}`
  );
  printListSection(
    'Advisory scripts',
    evidence.verification.advisoryScripts,
    (entry) => `${entry.script}: ${entry.tool}`
  );
  printListSection(
    'Repo audit report tools',
    evidence.verification.repoAuditReportDefinitions,
    (entry) => `${entry.tool}: ${entry.commands.join(' | ')}`
  );
  printListSection(
    'Smell families',
    evidence.smellFamilies ?? [],
    (entry) => `${entry.family}: ${entry.count} hit(s) [${entry.examples.join(', ')}]`
  );
  printListSection(
    'Skip-capable tools',
    evidence.verification.skipCapableTools,
    (entry) => `${entry.tool}: ${entry.states.join(', ')}`
  );
}
