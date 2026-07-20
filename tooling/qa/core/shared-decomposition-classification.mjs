import { extname } from 'node:path';

const TEST_PATH = /(?:^|\/)(?:test-support\/|[^/]+\.(?:test|spec|test-support)\.)/u;

export function sharedSourceParts(path, sourceRoot) {
  const relative = path.slice(sourceRoot.length + 1);
  const [area, ...rest] = relative.split('/');
  return { area, rest };
}

function platformRelative(policy, rest) {
  const [family, ...suffix] = rest;
  const owner = policy.platformSubowners[family];
  if (!owner) throw new Error(`unclassified platform family: ${family}`);
  return [owner, ...suffix].join('/');
}

function targetFor(policy, path, layer) {
  const { area, rest } = sharedSourceParts(path, policy.sourceRoot);
  if (!layer) return `${policy.appTargets[area]}/${rest.join('/')}`;
  const packagePolicy = policy.packages[layer];
  const relative = layer === 'platform' ? platformRelative(policy, rest) : rest.join('/');
  return `${packagePolicy.targetRoot}/${relative}`;
}

function exportKey(targetPath, targetRoot) {
  let relative = targetPath.slice(targetRoot.length + 1);
  relative = relative.slice(0, relative.length - extname(relative).length);
  if (relative.endsWith('/index')) relative = relative.slice(0, -'/index'.length);
  return `./${relative || 'index'}`;
}

export function createClassificationRecords(sourcePaths, layers, policy) {
  return sourcePaths.map((sourcePath) => {
    const layer = layers.get(sourcePath) ?? null;
    return {
      finalOwner: layer ?? `app:${sharedSourceParts(sourcePath, policy.sourceRoot).area}`,
      packageName: layer ? policy.packages[layer].name : null,
      sourcePath,
      targetPath: targetFor(policy, sourcePath, layer),
    };
  });
}

export function completeClassificationRecords(records, consumers, policy, tree) {
  const targetSet = new Set();
  for (const record of records) {
    if (targetSet.has(record.targetPath) || tree.exists(record.targetPath)) {
      throw new Error(`shared decomposition target collision: ${record.targetPath}`);
    }
    targetSet.add(record.targetPath);
    const packagePolicy = record.packageName
      ? Object.values(policy.packages).find((entry) => entry.name === record.packageName)
      : null;
    record.consumers = [...consumers.get(record.sourcePath)].sort();
    record.exportKey =
      packagePolicy && record.consumers.length > 0 && !TEST_PATH.test(record.sourcePath)
        ? exportKey(record.targetPath, packagePolicy.targetRoot)
        : null;
  }
}
