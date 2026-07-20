import fs from 'node:fs';
import path, { posix } from 'node:path';

import istanbulCoverage from 'istanbul-lib-coverage';

import { isCoverageExcluded, isCoverageTargetFile } from './verify-test-coverage.registry.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';
import { PRODUCT_SOURCE_ROOTS } from './quality.config.mjs';
import { fromRelativePath, toRelativePath } from './shared.mjs';

const { createCoverageMap, createCoverageSummary } = istanbulCoverage;
const DEFAULT_REPORT_PATH = '.tmp/coverage/unit/coverage-final.json';
const TOP_UNCOVERED_OWNER_LIMIT = 10;

function walkFiles(directory, root) {
  const absoluteDirectory = path.resolve(root, directory);
  if (!fs.existsSync(absoluteDirectory)) {
    return [];
  }

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(nextPath, root);
    }
    return entry.isFile() ? [nextPath] : [];
  });
}

export function collectProductionCoverageFiles({
  root = process.cwd(),
  sourceRoots = PRODUCT_SOURCE_ROOTS,
} = {}) {
  return sourceRoots
    .flatMap((sourceRoot) => walkFiles(sourceRoot, root))
    .filter((file) => isCoverageTargetFile(file) && !isCoverageExcluded(file))
    .sort();
}

function readCoverageByRelativePath(reportPath) {
  const coverageMap = createCoverageMap(
    JSON.parse(fs.readFileSync(fromRelativePath(reportPath), 'utf8'))
  );
  return new Map(
    coverageMap
      .files()
      .map((filePath) => [toRelativePath(filePath), coverageMap.fileCoverageFor(filePath)])
  );
}

function summarizeFiles(files, coverageByPath) {
  const summary = createCoverageSummary();
  const missing = [];
  for (const file of files) {
    const coverage = coverageByPath.get(file);
    if (!coverage) {
      missing.push(file);
      continue;
    }
    summary.merge(coverage.toSummary());
  }

  return {
    files: files.length,
    missing: missing.length,
    summary: summary.toJSON(),
  };
}

export function getCoverageOwnerKey(file) {
  const parts = file.split('/');
  if (parts[0] === 'packages') {
    return parts.slice(0, 4).join('/');
  }
  const domainIndex = 3;
  if (parts[domainIndex] === 'content') {
    return parts[domainIndex + 1] === 'logic' || parts[domainIndex + 1] === 'components'
      ? parts.slice(0, domainIndex + 3).join('/')
      : parts.slice(0, domainIndex + 2).join('/');
  }
  if (parts[domainIndex] === 'editor' || parts[domainIndex] === 'video-editor') {
    return parts.slice(0, domainIndex + 3).join('/');
  }
  return parts.slice(0, domainIndex + 2).join('/');
}

function summarizeOutsideOwners(files, coverageByPath) {
  const groups = new Map();
  for (const file of files) {
    const ownerKey = getCoverageOwnerKey(file);
    const ownerFiles = groups.get(ownerKey) ?? [];
    ownerFiles.push(file);
    groups.set(ownerKey, ownerFiles);
  }

  return [...groups.entries()]
    .map(([owner, ownerFiles]) => {
      const result = summarizeFiles(ownerFiles, coverageByPath);
      const lines = result.summary.lines;
      return {
        files: ownerFiles.length,
        linesPct: lines.pct,
        owner,
        uncoveredLines: lines.total - lines.covered,
      };
    })
    .sort((left, right) => right.uncoveredLines - left.uncoveredLines)
    .slice(0, TOP_UNCOVERED_OWNER_LIMIT);
}

function formatMetric(label, result) {
  const { branches, lines } = result.summary;
  return `${label}: files=${result.files}; missing=${result.missing}; lines=${lines.pct}%; branches=${branches.pct}%`;
}

export function collectCoverageAuditReport({ reportPath = DEFAULT_REPORT_PATH } = {}) {
  if (!fs.existsSync(fromRelativePath(reportPath))) {
    return {
      error: `Missing ${reportPath}.`,
      reportPath,
    };
  }

  const coverageByPath = readCoverageByRelativePath(reportPath);
  const productionFiles = collectProductionCoverageFiles();
  const rolloutFiles = productionFiles.filter((file) => resolveCoverageThreshold(file) !== null);
  const outsideFiles = productionFiles.filter((file) => resolveCoverageThreshold(file) === null);
  const prod = summarizeFiles(productionFiles, coverageByPath);
  const rollout = summarizeFiles(rolloutFiles, coverageByPath);
  const outside = summarizeFiles(outsideFiles, coverageByPath);

  return {
    error: null,
    outside,
    prod,
    reportPath,
    rollout,
    topOutsideOwners: summarizeOutsideOwners(outsideFiles, coverageByPath),
  };
}

export function formatCoverageAuditReport(report) {
  if (report.error) {
    return report.error;
  }

  const ownerLines = report.topOutsideOwners.map(
    (owner) =>
      `- ${owner.owner}: uncoveredLines=${owner.uncoveredLines}; files=${owner.files}; lines=${owner.linesPct}%`
  );
  return [
    formatMetric('prod', report.prod),
    formatMetric('rollout', report.rollout),
    formatMetric('outsideRegistry', report.outside),
    'top outside-registry uncovered owners:',
    ...ownerLines,
  ].join('\n');
}
