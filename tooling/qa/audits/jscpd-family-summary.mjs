function normalizePath(filePath) {
  return String(filePath ?? '').replace(/\\/g, '/');
}

function toDirectorySegments(filePath) {
  const normalizedPath = normalizePath(filePath);
  const directoryPath = normalizedPath.includes('/')
    ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))
    : normalizedPath;
  return directoryPath.split('/').filter(Boolean);
}

function collectCommonPrefix(leftSegments, rightSegments) {
  const prefix = [];
  const length = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    if (leftSegments[index] !== rightSegments[index]) {
      break;
    }
    prefix.push(leftSegments[index]);
  }
  return prefix;
}

function toOwnerFamilyLabel(filePath) {
  const segments = toDirectorySegments(filePath);
  if (segments[0] === 'apps' && segments[1] === 'extension' && segments[2] === 'src') {
    if (segments[3] === 'offscreen' && segments[4] === 'project-export') {
      return segments.slice(0, Math.min(5, segments.length)).join('/');
    }
    return segments.slice(0, Math.min(6, segments.length)).join('/');
  }
  if (segments[0] === 'src') {
    if (segments[1] === 'offscreen' && segments[2] === 'project-export') {
      return segments.slice(0, Math.min(3, segments.length)).join('/');
    }
    return segments.slice(0, Math.min(4, segments.length)).join('/');
  }
  if (segments[0] === 'tooling') {
    return segments.slice(0, Math.min(3, segments.length)).join('/');
  }
  if (segments[0] === 'scripts') {
    return segments.slice(0, Math.min(2, segments.length)).join('/');
  }
  if (segments[0] === 'tests' || segments[0] === 'test') {
    return segments.slice(0, Math.min(3, segments.length)).join('/');
  }
  return segments.slice(0, Math.min(3, segments.length)).join('/');
}

function toFamilyKey(entry) {
  const firstFamily = toOwnerFamilyLabel(entry.firstFile?.name ?? '');
  const secondFamily = toOwnerFamilyLabel(entry.secondFile?.name ?? '');
  if (firstFamily && firstFamily === secondFamily) {
    return firstFamily;
  }

  const firstSegments = toDirectorySegments(entry.firstFile?.name ?? '');
  const secondSegments = toDirectorySegments(entry.secondFile?.name ?? '');
  const commonPrefix = collectCommonPrefix(firstSegments, secondSegments);
  const minimumOwnerDepth = Math.min(
    firstFamily.split('/').filter(Boolean).length,
    secondFamily.split('/').filter(Boolean).length
  );
  if (commonPrefix.length >= minimumOwnerDepth) {
    return commonPrefix.join('/');
  }

  return [firstFamily, secondFamily]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .join(' <-> ');
}

function toSamplePair(entry) {
  const firstFile = normalizePath(entry.firstFile?.name ?? '<unknown>');
  const secondFile = normalizePath(entry.secondFile?.name ?? '<unknown>');
  return `${firstFile} <-> ${secondFile}`;
}

export function summarizeJscpdFamilies(duplicates, { limit = 10, sampleLimit = 2 } = {}) {
  const families = new Map();

  for (const duplicate of duplicates ?? []) {
    const familyKey = toFamilyKey(duplicate);
    const family = families.get(familyKey) ?? {
      family: familyKey,
      count: 0,
      lines: 0,
      samplePairs: [],
      sampleSet: new Set(),
    };
    family.count += 1;
    family.lines += Number(duplicate.lines ?? 0);

    const samplePair = toSamplePair(duplicate);
    if (family.samplePairs.length < sampleLimit && !family.sampleSet.has(samplePair)) {
      family.samplePairs.push(samplePair);
      family.sampleSet.add(samplePair);
    }

    families.set(familyKey, family);
  }

  return [...families.values()]
    .map((family) => ({
      family: family.family,
      count: family.count,
      lines: family.lines,
      samplePairs: family.samplePairs,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.lines - left.lines ||
        left.family.localeCompare(right.family)
    )
    .slice(0, limit);
}

export function formatJscpdFamilySummary(summary) {
  if (!summary || summary.length === 0) {
    return '';
  }

  const lines = ['Family summary:'];
  for (const entry of summary) {
    lines.push(`- ${entry.family} (count=${entry.count}, lines=${entry.lines})`);
    for (const samplePair of entry.samplePairs) {
      lines.push(`  sample: ${samplePair}`);
    }
  }
  return lines.join('\n');
}
