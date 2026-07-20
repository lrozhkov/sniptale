import fs from 'node:fs';
import istanbulCoverage from 'istanbul-lib-coverage';

import { fromRelativePath } from './shared.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';

const { createCoverageMap } = istanbulCoverage;
const REPORT_PATH = '.tmp/coverage/unit/coverage-final.json';
const HELPER_FILE_PATTERN = /\.(?:helpers|parts|shared)\.(?:ts|tsx)$/u;
const FIXTURE_FILE_PATTERN = /\.(?:fixtures|test-helpers)\.(?:ts|tsx)$/u;

function classifyCoverageResidual(relativePath, threshold, summary) {
  if (!summary) {
    return {
      category: 'missing-proof',
      reason: 'no coverage summary found for a rollout-tracked production file',
    };
  }

  const belowLines = summary.lines.pct < threshold.lines;
  const belowBranches = summary.branches.pct < threshold.branches;
  if (!belowLines && !belowBranches) {
    return null;
  }

  if (FIXTURE_FILE_PATTERN.test(relativePath)) {
    return {
      category: 'test-fixture-only',
      reason: 'test-fixture seam is tracked, but residual debt sits in helper-only default paths',
    };
  }

  if (HELPER_FILE_PATTERN.test(relativePath)) {
    return {
      category: 'helper-tail',
      reason: 'remaining coverage debt sits in helper/fallback tails rather than the public seam',
    };
  }

  const nearTarget =
    summary.lines.pct >= threshold.lines - 5 && summary.branches.pct >= threshold.branches - 5;
  if (nearTarget && summary.functions.pct === 100 && !belowLines) {
    return {
      category: 'likely-unreachable-tail',
      reason: 'only a small branch tail remains after the public path is already covered',
    };
  }

  if (nearTarget) {
    return {
      category: 'near-target-public-tail',
      reason: 'public seam is close to target but still has a small reachable fallback gap',
    };
  }

  return {
    category: 'public-gap',
    reason: 'coverage debt still sits on a public or owner-facing seam',
  };
}

export function collectCoverageResidualReport({
  files = [],
  coverageReportPath = REPORT_PATH,
} = {}) {
  const absoluteReportPath = fromRelativePath(coverageReportPath);
  if (!fs.existsSync(absoluteReportPath)) {
    return [];
  }

  const coverageMap = createCoverageMap(JSON.parse(fs.readFileSync(absoluteReportPath, 'utf8')));
  const summaries = new Map(
    coverageMap
      .files()
      .map((filePath) => [
        filePath.replace(`${process.cwd()}/`, ''),
        coverageMap.fileCoverageFor(filePath).toSummary(),
      ])
  );

  return files.flatMap((relativePath) => {
    const threshold = resolveCoverageThreshold(relativePath);
    if (!threshold) {
      return [];
    }

    const summary = summaries.get(relativePath) ?? null;
    const classification = classifyCoverageResidual(relativePath, threshold, summary);
    if (!classification) {
      return [];
    }

    return [
      {
        file: relativePath,
        category: classification.category,
        reason: classification.reason,
        threshold,
        summary,
      },
    ];
  });
}

export function summarizeCoverageResidualReport(report) {
  const counts = new Map();
  for (const entry of report) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category, count]) => `${category}=${count}`);
}
