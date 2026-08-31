function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dependencyNameFromLockPath(lockPath) {
  if (typeof lockPath !== 'string') return null;
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index === -1) return null;
  const parts = lockPath.slice(index + marker.length).split('/');
  if (!parts[0]) return null;
  if (!parts[0].startsWith('@')) return parts[0];
  return parts[1] ? `${parts[0]}/${parts[1]}` : null;
}

function hasDependency(rootPackage, field, name) {
  const dependencies = isObject(rootPackage?.[field]) ? rootPackage[field] : null;
  return dependencies ? Object.hasOwn(dependencies, name) : false;
}

function isDevelopmentEntry(entry) {
  if (!isObject(entry)) return null;
  if (entry.dev !== undefined && typeof entry.dev !== 'boolean') return null;
  if (entry.devOptional !== undefined && typeof entry.devOptional !== 'boolean') return null;
  return entry.dev === true || entry.devOptional === true;
}

export function resolveLockPackageName(lockPath, entry) {
  if (!isObject(entry)) return null;
  if (typeof entry.name === 'string' && entry.name) return entry.name;
  return dependencyNameFromLockPath(lockPath);
}

export function classifyDependencyScope(rootPackage, lockPath, name, entry) {
  if (!isObject(rootPackage) || typeof name !== 'string' || !name) return null;
  const developmentEntry = isDevelopmentEntry(entry);
  if (developmentEntry === null) return null;

  const directPath = `node_modules/${name}`;
  const directRuntime =
    lockPath === directPath &&
    ['dependencies', 'optionalDependencies'].some((field) =>
      hasDependency(rootPackage, field, name)
    );
  const directDevelopment =
    lockPath === directPath && hasDependency(rootPackage, 'devDependencies', name);

  if (directRuntime && directDevelopment) return null;
  if (directRuntime) return developmentEntry ? null : 'direct-runtime';
  if (directDevelopment) return developmentEntry ? 'direct-development' : null;
  return developmentEntry ? 'transitive-development' : 'transitive-runtime';
}
