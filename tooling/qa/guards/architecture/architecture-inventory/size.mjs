import fs from 'node:fs';
import path from 'node:path';

function countLines(text) {
  return text.length === 0 ? 0 : text.split(/\r?\n/u).length;
}

function readFileText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function createEmptyMetric(pathName) {
  return { files: 0, loc: 0, path: pathName };
}

function addFileMetric(metrics, pathName, loc) {
  const current = metrics.get(pathName) ?? createEmptyMetric(pathName);
  current.files += 1;
  current.loc += loc;
  metrics.set(pathName, current);
}

function sortMetrics(metrics) {
  return [...metrics.values()].sort(
    (left, right) =>
      right.loc - left.loc || right.files - left.files || left.path.localeCompare(right.path)
  );
}

function getTopLevelSrcRoot(relativePath) {
  const segments = relativePath.split('/');
  if (
    segments.length >= 4 &&
    segments[0] === 'apps' &&
    segments[1] === 'extension' &&
    segments[2] === 'src'
  ) {
    return segments.slice(0, 4).join('/');
  }
  return segments.length >= 2 && segments[0] === 'packages' ? segments.slice(0, 2).join('/') : null;
}

function getSharedOwnerPath(relativePath) {
  const segments = relativePath.split('/');
  return segments.length >= 2 && segments[0] === 'packages' ? segments.slice(0, 2).join('/') : null;
}

export function collectInventorySizeMetrics(files, root) {
  const topLevelRoots = new Map();
  const sharedOwners = new Map();
  for (const file of files) {
    const loc = countLines(readFileText(root, file));
    const rootPath = getTopLevelSrcRoot(file);
    if (rootPath) {
      addFileMetric(topLevelRoots, rootPath, loc);
    }
    const sharedOwnerPath = getSharedOwnerPath(file);
    if (sharedOwnerPath) {
      addFileMetric(sharedOwners, sharedOwnerPath, loc);
    }
  }

  return {
    topLevelRoots: sortMetrics(topLevelRoots),
    largestSharedOwners: sortMetrics(sharedOwners).slice(0, 10),
  };
}
