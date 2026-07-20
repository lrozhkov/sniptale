function compareResidualSeamEntries(left, right) {
  return (
    right.lines - left.lines || right.tokens - left.tokens || left.file.localeCompare(right.file)
  );
}

function getCostSeverity(entry) {
  return Math.max(entry.lines / 200, entry.tokens / 1200);
}

function compareSizeCostEntries(left, right) {
  return (
    getCostSeverity(right) - getCostSeverity(left) ||
    right.tokens - left.tokens ||
    right.lines - left.lines ||
    left.file.localeCompare(right.file)
  );
}

function buildSizeValueMaps({ lineHotspots, tokenHotspots }) {
  return {
    lineCounts: new Map(lineHotspots.map((entry) => [entry.file, entry.lines])),
    tokenCounts: new Map(tokenHotspots.map((entry) => [entry.file, entry.tokens])),
  };
}

function buildSizedEntry(file, maps, classifyFile) {
  return {
    file,
    kind: classifyFile(file),
    lines: maps.lineCounts.get(file) ?? 0,
    tokens: maps.tokenCounts.get(file) ?? 0,
  };
}

function getReasonPriority(reason) {
  if (reason.startsWith('security:')) {
    return 5;
  }
  if (reason.startsWith('direct-seam:')) {
    return 4;
  }
  if (reason.startsWith('guardrail:') || reason.startsWith('allowance:')) {
    return 3;
  }
  if (reason.startsWith('topology:')) {
    return 2;
  }
  if (reason === 'eslint-warning') {
    return 1;
  }
  return 0;
}

function getEntrySignalPriority(entry) {
  return Math.max(...entry.reasons.map(getReasonPriority), 0);
}

export function collectResidualSeamEntries({ files, lineHotspots, tokenHotspots, limit }) {
  const { lineCounts, tokenCounts } = buildSizeValueMaps({ lineHotspots, tokenHotspots });

  return files
    .map((file) => ({
      file,
      lines: lineCounts.get(file) ?? 0,
      tokens: tokenCounts.get(file) ?? 0,
    }))
    .sort(compareResidualSeamEntries)
    .slice(0, limit);
}

export function collectSizeCostEntries({
  classifyFile = () => 'production',
  files,
  lineHotspots,
  tokenHotspots,
  limit,
}) {
  const maps = buildSizeValueMaps({ lineHotspots, tokenHotspots });

  return files
    .map((file) => buildSizedEntry(file, maps, classifyFile))
    .filter((entry) => entry.lines >= 200 || entry.tokens >= 1200)
    .sort(compareSizeCostEntries)
    .slice(0, limit);
}

export function collectCandidateSeamEntries({
  classifyFile = () => 'production',
  files,
  lineHotspots,
  signalMap,
  tokenHotspots,
  limit,
}) {
  const fileSet = new Set(files);
  const maps = buildSizeValueMaps({ lineHotspots, tokenHotspots });

  return [...signalMap.entries()]
    .filter(([file]) => fileSet.has(file) && classifyFile(file) === 'production')
    .map(([file, reasons]) => ({
      ...buildSizedEntry(file, maps, classifyFile),
      reasons: [...reasons].sort(),
    }))
    .sort(
      (left, right) =>
        getEntrySignalPriority(right) - getEntrySignalPriority(left) ||
        right.reasons.length - left.reasons.length ||
        left.file.localeCompare(right.file)
    )
    .slice(0, limit);
}

export function formatResidualSeamEntry(entry) {
  return `${entry.file} (${entry.lines} lines${entry.tokens > 0 ? `, ${entry.tokens} tokens` : ''})`;
}

export function formatSizeCostEntry(entry) {
  const suffix = entry.kind === 'production' ? '' : `:${entry.kind}`;
  return `${entry.file}(${entry.lines}l${entry.tokens > 0 ? `/${entry.tokens}t` : ''}${suffix})`;
}
