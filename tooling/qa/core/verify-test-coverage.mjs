import fs from 'node:fs';
import istanbulCoverage from 'istanbul-lib-coverage';
import ts from 'typescript';
import {
  collectCodeFiles as codeFiles,
  filterAllowedViolations as allow,
  fromRelativePath as abs,
  isExecutedAsScript as script,
  loadBaseline as loadBase,
  parseFilesArgument as filesArg,
  printViolations as print,
  toRelativePath as rel,
  readText,
} from './shared.mjs';
import { collectCoverageRolloutFiles } from './verify-test-coverage.registry.mjs';
import { resolveCoverageThreshold } from './verify-test-coverage.thresholds.mjs';
import { formatCoverageAdvice } from './verify-test-coverage.feedback.mjs';
import { runLineLengthCheck as lineCheck } from '../guards/quality/verify-line-length.mjs';
import { runUnitTests as unit } from './verify-unit-tests.mjs';
import { collectChangedTargets } from '../runtime/changed-targets.helpers.mjs';

const { createCoverageMap } = istanbulCoverage;

const REPORT_PATH = '.tmp/coverage/unit/coverage-final.json';
const createViolation = (rule, file, message) => ({ rule, file, message });

function getNodeLineRange(sourceFile, node) {
  return {
    start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

function isCoverageNeutralStatement(statement) {
  return (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  );
}

function collectCoverageNeutralLineRanges(relativePath, sourceText) {
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true);

  return sourceFile.statements
    .filter(isCoverageNeutralStatement)
    .map((statement) => getNodeLineRange(sourceFile, statement));
}

function isLineWithinRanges(lineNumber, ranges) {
  return ranges.some((range) => lineNumber >= range.start && lineNumber <= range.end);
}

export function hasRuntimeCoverageRelevantChange({
  relativePath,
  sourceText,
  changedLineNumbers,
  isUntracked = false,
}) {
  if (isUntracked || changedLineNumbers == null) {
    return true;
  }
  if (changedLineNumbers.size === 0) {
    return false;
  }

  const lines = sourceText.split(/\r?\n/u);
  const coverageNeutralRanges = collectCoverageNeutralLineRanges(relativePath, sourceText);

  return [...changedLineNumbers].some((lineNumber) => {
    const lineText = lines[lineNumber - 1]?.trim() ?? '';

    return lineText.length > 0 && !isLineWithinRanges(lineNumber, coverageNeutralRanges);
  });
}

function filterCoverageNeutralChangedFiles(
  candidateFiles,
  { changedTargets = collectChangedTargets({ scope: 'workspace' }), sourceReader = readText } = {}
) {
  const changedFileSet = new Set(changedTargets.changedFiles);

  return candidateFiles.filter((file) => {
    if (!changedFileSet.has(file) || changedTargets.untrackedFiles.has(file)) {
      return true;
    }

    return hasRuntimeCoverageRelevantChange({
      relativePath: file,
      sourceText: sourceReader(file),
      changedLineNumbers: changedTargets.changedLineMap.get(file),
      isUntracked: false,
    });
  });
}

export function resolveCoverageTargetFiles({
  files = [],
  codeFileCollector = codeFiles,
  changedWorkspaceFiles = null,
  changedTargets = null,
  mode = 'changed',
  sourceReader = readText,
} = {}) {
  if (mode === 'full') {
    return collectCoverageRolloutFiles();
  }

  const candidateFiles =
    files.length > 0
      ? codeFileCollector(files)
      : (changedWorkspaceFiles ?? lineCheck({ scope: 'workspace' }).files);

  return filterCoverageNeutralChangedFiles(
    candidateFiles.filter((file) => resolveCoverageThreshold(file) !== null),
    {
      changedTargets:
        changedTargets ??
        (changedWorkspaceFiles == null
          ? collectChangedTargets({ scope: 'workspace' })
          : {
              changedFiles: changedWorkspaceFiles,
              changedLineMap: new Map(),
              untrackedFiles: new Set(changedWorkspaceFiles),
            }),
      sourceReader,
    }
  );
}

export function collectCoverageViolations(
  relativeFiles,
  coverageSummaries,
  {
    changedTargets = collectChangedTargets({ scope: 'workspace' }),
    coverageDetails = new Map(),
  } = {}
) {
  const violations = [];

  for (const relativePath of relativeFiles) {
    const threshold = resolveCoverageThreshold(relativePath);
    if (!threshold) {
      continue;
    }

    const summary = coverageSummaries.get(relativePath);
    if (!summary) {
      violations.push(createViolation('test-coverage-missing-file', relativePath, 'No coverage.'));
      continue;
    }
    const advice = formatCoverageAdvice(
      coverageDetails.get(relativePath),
      changedTargets.changedLineMap.get(relativePath),
      relativePath
    );

    if (summary.lines.pct < threshold.lines) {
      violations.push(
        createViolation(
          'test-coverage-lines',
          relativePath,
          `Lines ${summary.lines.pct.toFixed(2)}% < ${threshold.lines}%.${advice}`
        )
      );
    }

    if (summary.branches.pct < threshold.branches) {
      violations.push(
        createViolation(
          'test-coverage-branches',
          relativePath,
          `Branches ${summary.branches.pct.toFixed(2)}% < ${threshold.branches}%.${advice}`
        )
      );
    }
  }

  return violations;
}

export function runTestCoverageCheck({
  files = [],
  coverageReportPath = REPORT_PATH,
  baseline = loadBase(),
  mode = 'changed',
} = {}) {
  const changedTargets = collectChangedTargets({ scope: 'workspace' });
  const targetFiles = resolveCoverageTargetFiles({ changedTargets, files, mode });
  if (targetFiles.length === 0) {
    return {
      files: [],
      skipped: true,
      violations: [],
      error: null,
    };
  }

  const reportFile = abs(coverageReportPath);
  if (!fs.existsSync(reportFile)) {
    return {
      files: targetFiles,
      skipped: false,
      violations: [],
      error: `Missing ${coverageReportPath}.`,
    };
  }

  const coverageMap = createCoverageMap(JSON.parse(fs.readFileSync(reportFile, 'utf8')));
  const summaries = new Map();
  const coverageDetails = new Map();
  for (const filePath of coverageMap.files()) {
    const relativePath = rel(filePath);
    const fileCoverage = coverageMap.fileCoverageFor(filePath);
    summaries.set(relativePath, fileCoverage.toSummary());
    coverageDetails.set(relativePath, fileCoverage);
  }

  return {
    files: targetFiles,
    skipped: false,
    violations: allow(
      collectCoverageViolations(targetFiles, summaries, { changedTargets, coverageDetails }),
      baseline
    ),
    error: null,
  };
}

if (script(import.meta.url)) {
  const explicitFiles = filesArg(process.argv.slice(2));
  const shouldRunCoverage = process.argv.includes('--run-coverage');

  if (shouldRunCoverage) {
    const unitTestResult = unit({ coverage: true });

    if (unitTestResult.stdout) {
      process.stdout.write(unitTestResult.stdout);
    }
    if (unitTestResult.stderr) {
      process.stderr.write(unitTestResult.stderr);
    }
    if (unitTestResult.status !== 0) {
      process.exit(unitTestResult.status ?? 1);
    }
  }

  const result = runTestCoverageCheck({ files: explicitFiles });

  if (result.skipped) {
    process.stdout.write('Skipped\n');
    process.exit(0);
  }

  if (result.error) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }

  if (result.violations.length > 0) {
    print('Coverage:', result.violations);
    process.exit(1);
  }

  process.stdout.write('OK\n');
}
