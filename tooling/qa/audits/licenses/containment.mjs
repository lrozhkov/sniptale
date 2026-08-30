import { isAuditObject } from '../contracts/result-contract.mjs';
import {
  classifyDependencyScope,
  resolveLockPackageName,
} from '../../analysis/dependencies/dependency-lock-identity.mjs';

const PACKAGE_PATH_PROPERTY = 'cdx:npm:package:path';
const DEVELOPMENT_PROPERTY = 'cdx:npm:package:development';

function componentProperty(component, name) {
  const matches = (component.properties ?? []).filter((property) => property?.name === name);
  if (matches.length !== 1 || typeof matches[0].value !== 'string') return null;
  return matches[0].value;
}

function componentPurlIdentity(component) {
  if (typeof component.purl !== 'string') return null;
  const match = component.purl.match(/^pkg:npm\/(.+)@([^@/?]+)$/u);
  if (!match) return null;
  try {
    return {
      name: decodeURIComponent(match[1]),
      version: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

function findLockCandidate(component, lock) {
  const purlIdentity = componentPurlIdentity(component);
  if (!purlIdentity || purlIdentity.version !== component.version) {
    return null;
  }
  const candidates = Object.entries(lock.packages).filter(([lockPath, entry]) => {
    if (!lockPath.includes('node_modules/') || !isAuditObject(entry)) return false;
    return (
      resolveLockPackageName(lockPath, entry) === purlIdentity.name &&
      entry.version === component.version
    );
  });
  return candidates.length === 1 ? candidates[0] : null;
}

export function describeLicenseLockSchema(lock) {
  if (
    !isAuditObject(lock) ||
    !Number.isInteger(lock.lockfileVersion) ||
    lock.lockfileVersion < 2 ||
    !isAuditObject(lock.packages) ||
    !isAuditObject(lock.packages[''])
  ) {
    return 'lockfileVersion >= 2 and packages with a root entry are required';
  }
  return null;
}

export function collectDecisionContainment(component, lock) {
  const lockPath = componentProperty(component, PACKAGE_PATH_PROPERTY);
  const candidate = lockPath
    ? [lockPath, lock.packages[lockPath]]
    : findLockCandidate(component, lock);
  if (!candidate || !candidate[0].includes('node_modules/')) return null;
  const [candidatePath, entry] = candidate;
  if (!isAuditObject(entry)) return null;
  const name = resolveLockPackageName(candidatePath, entry);
  const purlIdentity = componentPurlIdentity(component);
  if (
    entry.version !== component.version ||
    (component.purl !== undefined && !purlIdentity) ||
    (purlIdentity ? name !== purlIdentity.name : name !== component.name)
  ) {
    return null;
  }
  const scope = classifyDependencyScope(lock.packages[''], candidatePath, name, entry);
  if (!scope) return null;

  const developmentProperties = (component.properties ?? []).filter(
    (property) => property?.name === DEVELOPMENT_PROPERTY
  );
  if (developmentProperties.length > 1) return null;
  const sbomDevelopment = developmentProperties[0]?.value === 'true';
  if (
    (developmentProperties.length === 1 &&
      !['true', 'false'].includes(developmentProperties[0]?.value)) ||
    sbomDevelopment !== scope.includes('development')
  ) {
    return null;
  }

  return {
    packageName: name,
    dependencyScope: scope,
    artifactInclusion: sbomDevelopment ? 'development-only' : 'source-runtime-candidate',
  };
}
