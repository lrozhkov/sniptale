import fs from 'node:fs/promises';
import path from 'node:path';

const APP_PACKAGE_PATH = 'apps/extension';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function readDependencies(packageRecord, label) {
  const dependencies = packageRecord.dependencies ?? {};
  assertObject(dependencies, `${label} dependencies`);
  return Object.keys(dependencies).sort(compareText);
}

function isCompileOnlyOrWorkspace(packageName) {
  return packageName.startsWith('@sniptale/') || packageName.startsWith('@types/');
}

function parentSearchBase(packagePath) {
  const nestedMarker = packagePath.lastIndexOf('/node_modules/');
  if (nestedMarker >= 0) return packagePath.slice(0, nestedMarker);
  if (packagePath.startsWith('node_modules/')) return '';
  const parent = path.posix.dirname(packagePath);
  return parent === '.' ? '' : parent;
}

function dependencyCandidates(parentPackagePath, packageName) {
  const candidates = [];
  let searchBase = parentPackagePath;
  while (true) {
    const prefix = searchBase ? `${searchBase}/` : '';
    candidates.push(`${prefix}node_modules/${packageName}`);
    if (!searchBase) break;
    searchBase = parentSearchBase(searchBase);
  }
  return [...new Set(candidates)];
}

function resolveLockPackage(packages, parentPackagePath, packageName) {
  return dependencyCandidates(parentPackagePath, packageName).find(
    (candidate) => packages[candidate]
  );
}

async function readInstalledMetadata(
  repoRoot,
  packagePath,
  expectedName,
  expectedVersion,
  expectedLicense
) {
  const metadataPath = path.resolve(repoRoot, packagePath, 'package.json');
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  } catch (error) {
    throw new Error(`Installed package metadata is unavailable: ${packagePath}`, { cause: error });
  }
  assertObject(metadata, `Installed package metadata for ${packagePath}`);
  if (
    metadata.name !== expectedName ||
    metadata.version !== expectedVersion ||
    metadata.license !== expectedLicense
  ) {
    throw new Error(`Installed package metadata does not match package-lock: ${packagePath}`);
  }
  return metadata;
}

function requirePackageIdentity(packageRecord, packagePath) {
  if (typeof packageRecord.version !== 'string' || !packageRecord.version) {
    throw new Error(`package-lock entry is missing a version: ${packagePath}`);
  }
  if (typeof packageRecord.license !== 'string' || !packageRecord.license) {
    throw new Error(`package-lock entry is missing a license: ${packagePath}`);
  }
  return { licenseExpression: packageRecord.license, version: packageRecord.version };
}

async function materializeRecord(repoRoot, packageName, packagePath, packageRecord) {
  const identity = requirePackageIdentity(packageRecord, packagePath);
  const installedMetadata = await readInstalledMetadata(
    repoRoot,
    packagePath,
    packageName,
    identity.version,
    identity.licenseExpression
  );
  return {
    ...identity,
    integrity: packageRecord.integrity,
    installedMetadata,
    packageDirectory: path.resolve(repoRoot, packagePath),
    packageName,
    packagePath,
    repoRoot,
    resolved: packageRecord.resolved,
  };
}

/**
 * Discovers the installed non-optional runtime dependency closure rooted at the repository and
 * extension package dependency declarations in package-lock v3.
 */
export async function discoverLockedProductionPackages({
  appPackagePath = APP_PACKAGE_PATH,
  lockfilePath = 'package-lock.json',
  repoRoot = process.cwd(),
} = {}) {
  const lock = JSON.parse(await fs.readFile(path.resolve(repoRoot, lockfilePath), 'utf8'));
  const packages = assertObject(lock.packages, 'package-lock packages');
  const rootRecord = assertObject(packages[''], 'package-lock root package');
  const appRecord = assertObject(
    packages[appPackagePath],
    `package-lock ${appPackagePath} package`
  );
  const pending = [
    ...readDependencies(rootRecord, 'root').map((packageName) => ({ packageName, parentPath: '' })),
    ...readDependencies(appRecord, appPackagePath).map((packageName) => ({
      packageName,
      parentPath: appPackagePath,
    })),
  ];
  const discovered = [];
  const visitedPaths = new Set();

  while (pending.length > 0) {
    const request = pending.shift();
    if (isCompileOnlyOrWorkspace(request.packageName)) continue;
    const packagePath = resolveLockPackage(packages, request.parentPath, request.packageName);
    if (!packagePath) {
      throw new Error(
        `package-lock is missing runtime dependency ${request.packageName} from ${request.parentPath || '<root>'}.`
      );
    }
    if (visitedPaths.has(packagePath)) continue;
    visitedPaths.add(packagePath);
    const packageRecord = assertObject(packages[packagePath], `package-lock entry ${packagePath}`);
    discovered.push(
      await materializeRecord(repoRoot, request.packageName, packagePath, packageRecord)
    );
    for (const packageName of readDependencies(packageRecord, packagePath)) {
      pending.push({ packageName, parentPath: packagePath });
    }
  }

  return discovered.sort((left, right) => compareText(left.packagePath, right.packagePath));
}
