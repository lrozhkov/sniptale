import fs from 'node:fs';

import { fromRelativePath } from './shared.mjs';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;

function formatLineRange(start, end) {
  return start === end ? String(start) : `${start}-${end}`;
}

function compactLineRanges(lineNumbers) {
  const sortedLines = [...new Set(lineNumbers)].sort((left, right) => left - right);
  const ranges = [];
  for (const lineNumber of sortedLines) {
    const lastRange = ranges.at(-1);
    if (lastRange && lastRange.end + 1 === lineNumber) {
      lastRange.end = lineNumber;
    } else {
      ranges.push({ start: lineNumber, end: lineNumber });
    }
  }
  return ranges.map((range) => formatLineRange(range.start, range.end));
}

function lineOverlapsLocation(lineNumber, location) {
  return lineNumber >= location.start.line && lineNumber <= location.end.line;
}

function findNearestFunctionName(fileCoverage, lineNumber) {
  const fnMap = fileCoverage.data.fnMap ?? {};
  for (const [id, functionMeta] of Object.entries(fnMap)) {
    if (lineOverlapsLocation(lineNumber, functionMeta.loc) && fileCoverage.data.f?.[id] === 0) {
      return functionMeta.name && functionMeta.name !== '(anonymous)'
        ? functionMeta.name
        : `function at ${formatLineRange(functionMeta.loc.start.line, functionMeta.loc.end.line)}`;
    }
  }
  return '';
}

function collectUncoveredChangedLines(fileCoverage, changedLines) {
  const statementMap = fileCoverage.data.statementMap ?? {};
  const statementCounts = fileCoverage.data.s ?? {};
  return [...changedLines].filter((lineNumber) =>
    Object.entries(statementMap).some(
      ([id, location]) =>
        statementCounts[id] === 0 &&
        lineNumber >= location.start.line &&
        lineNumber <= location.end.line
    )
  );
}

function collectUncoveredChangedBranches(fileCoverage, changedLines) {
  const branchMap = fileCoverage.data.branchMap ?? {};
  const branchCounts = fileCoverage.data.b ?? {};
  const lines = [];
  for (const [id, branchMeta] of Object.entries(branchMap)) {
    const counts = branchCounts[id] ?? [];
    for (const [index, location] of branchMeta.locations.entries()) {
      if (counts[index] !== 0) {
        continue;
      }
      for (const lineNumber of changedLines) {
        if (lineOverlapsLocation(lineNumber, location)) {
          lines.push(lineNumber);
        }
      }
    }
  }
  return lines;
}

function collectSuggestedProofFiles(relativePath) {
  const directory = relativePath.replace(/\/[^/]+$/u, '');
  const absoluteDirectory = fromRelativePath(directory);
  if (!fs.existsSync(absoluteDirectory) || !fs.statSync(absoluteDirectory).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(absoluteDirectory)
    .filter((entry) => TEST_FILE_PATTERN.test(entry))
    .map((entry) => `${directory}/${entry}`)
    .sort();
}

export function formatCoverageAdvice(fileCoverage, changedLines, relativePath) {
  if (!fileCoverage || !changedLines || changedLines.size === 0) {
    return '';
  }

  const uncoveredLines = collectUncoveredChangedLines(fileCoverage, changedLines);
  const uncoveredBranches = collectUncoveredChangedBranches(fileCoverage, changedLines);
  const advice = [];

  if (uncoveredLines.length > 0) {
    const firstLine = uncoveredLines[0];
    const nearestFunction = findNearestFunctionName(fileCoverage, firstLine);
    advice.push(
      [
        `Uncovered changed lines: ${compactLineRanges(uncoveredLines).slice(0, 4).join(', ')}`,
        nearestFunction ? `near ${nearestFunction}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  if (uncoveredBranches.length > 0) {
    advice.push(
      `Uncovered changed branches near lines: ${compactLineRanges(uncoveredBranches)
        .slice(0, 4)
        .join(', ')}`
    );
  }

  const proofFiles = collectSuggestedProofFiles(relativePath);
  if (proofFiles.length > 0) {
    advice.push(`Suggested proof: ${proofFiles.slice(0, 4).join(', ')}`);
  }

  return advice.length > 0 ? ` ${advice.join('; ')}.` : '';
}
