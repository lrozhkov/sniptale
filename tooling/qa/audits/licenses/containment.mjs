import { isAuditObject } from '../result-contract.mjs';
import {
  classifyDependencyScope,
  resolveLockPackageName,
} from '../../core/dependency-lock-identity.mjs';

const PACKAGE_PATH_PROPERTY = 'cdx:npm:package:path';
const DEVELOPMENT_PROPERTY = 'cdx:npm:package:development';

function componentProperty(component, name) {
  const matches = (component.properties ?? []).filter((property) => property?.name === name);
  if (matches.length !== 1 || typeof matches[0].value !== 'string') return null;
  return matches[0].value;
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
  if (!lockPath || !lockPath.includes('node_modules/')) return null;
  const entry = lock.packages[lockPath];
  if (!isAuditObject(entry)) return null;
  const name = resolveLockPackageName(lockPath, entry);
  if (name !== component.name || entry.version !== component.version) return null;
  const scope = classifyDependencyScope(lock.packages[''], lockPath, name, entry);
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
    dependencyScope: scope,
    artifactInclusion: sbomDevelopment ? 'development-only' : 'source-runtime-candidate',
  };
}
