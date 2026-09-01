import fs from 'node:fs';
import path, { posix } from 'node:path';

import istanbulCoverage from 'istanbul-lib-coverage';
import istanbulReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

import { isCoverageExcluded, isCoverageTargetFile } from './test-coverage/registry.mjs';
import { resolveCoverageThreshold } from './test-coverage/thresholds.mjs';
import { PRODUCT_SOURCE_ROOTS } from '../../policy/quality/quality.config.mjs';

const { createCoverageMap, createCoverageSummary } = istanbulCoverage;
const DEFAULT_REPORT_PATH = '.tmp/coverage/unit/coverage-final.json';
export const CANONICAL_COVERAGE_DIRECTORY = '.tmp/coverage/canonical';
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

function readCoverageByRelativePath(reportPath, root = process.cwd()) {
  const coverageMap = createCoverageMap(
    JSON.parse(fs.readFileSync(path.resolve(root, reportPath), 'utf8'))
  );
  const outsideRoot = [];
  const byPath = new Map();
  for (const filePath of coverageMap.files()) {
    const relativePath = path.relative(root, path.resolve(filePath)).replaceAll(path.sep, '/');
    if (relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
      outsideRoot.push(filePath);
      continue;
    }
    byPath.set(relativePath, coverageMap.fileCoverageFor(filePath));
  }
  return { byPath, outsideRoot };
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

export function collectCoverageAuditReport({
  reportPath = DEFAULT_REPORT_PATH,
  root = process.cwd(),
} = {}) {
  const absoluteReportPath = path.resolve(root, reportPath);
  if (!fs.existsSync(absoluteReportPath)) {
    return {
      error: `Missing ${reportPath}.`,
      reportPath,
    };
  }

  let parsedCoverage;
  try {
    parsedCoverage = readCoverageByRelativePath(reportPath, root);
  } catch (error) {
    return {
      error: `Malformed ${reportPath}: ${error instanceof Error ? error.message : String(error)}`,
      reportPath,
    };
  }
  if (parsedCoverage.outsideRoot.length > 0) {
    return {
      error: `Coverage contains paths outside repository root: ${parsedCoverage.outsideRoot.join(', ')}`,
      reportPath,
    };
  }
  const coverageByPath = parsedCoverage.byPath;
  const productionFiles = collectProductionCoverageFiles({ root });
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
    productionFiles,
  };
}

export function writeCanonicalCoverageArtifacts({
  report = collectCoverageAuditReport(),
  reportPath = DEFAULT_REPORT_PATH,
  outputDirectory = CANONICAL_COVERAGE_DIRECTORY,
  root = process.cwd(),
} = {}) {
  if (report.error) throw new Error(report.error);
  if (report.prod.missing > 0) {
    throw new Error(`Coverage is missing ${report.prod.missing} production file(s).`);
  }
  const { byPath, outsideRoot } = readCoverageByRelativePath(reportPath, root);
  if (outsideRoot.length > 0) throw new Error('Coverage contains paths outside repository root.');
  const filteredMap = createCoverageMap({});
  for (const relativePath of report.productionFiles) {
    const fileCoverage = byPath.get(relativePath);
    if (!fileCoverage) throw new Error(`Coverage is missing production file: ${relativePath}`);
    filteredMap.addFileCoverage(fileCoverage);
  }
  const absoluteOutput = path.resolve(root, outputDirectory);
  fs.rmSync(absoluteOutput, { recursive: true, force: true });
  fs.mkdirSync(absoluteOutput, { recursive: true });
  const context = istanbulReport.createContext({ dir: absoluteOutput, coverageMap: filteredMap });
  const reporterTimings = {};
  for (const [name, options] of [
    ['json', { file: 'coverage-final.json' }],
    ['json-summary', { file: 'coverage-summary.json' }],
    ['lcovonly', { file: 'lcov.info', projectRoot: root }],
    ['html', { subdir: 'html' }],
  ]) {
    const startedAt = performance.now();
    istanbulReports.create(name, options).execute(context);
    reporterTimings[name] = Math.round((performance.now() - startedAt) * 10) / 10;
  }
  return {
    directory: outputDirectory,
    files: ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'html/index.html'],
    summary: filteredMap.getCoverageSummary().toJSON(),
    reporterTimings,
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
