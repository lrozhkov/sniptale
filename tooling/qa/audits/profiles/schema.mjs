import { AUDIT_STEPS } from '../../core/qa-steps/definitions.data.mjs';

export const AUDIT_PROFILE_SCHEMA_VERSION = 1;
export const AUDIT_PROFILE_IDS = Object.freeze(['repository', 'security', 'release']);
export const AUDIT_CONTROL_REQUIREMENTS = Object.freeze(['required', 'optional', 'excluded']);
export const GITLEAKS_SCOPES = Object.freeze(['worktree', 'history']);

const auditControlIds = AUDIT_STEPS.map(([id]) => id);
const securityEngineIds = [
  'npm-audit',
  'npm-audit-signatures',
  'osv-scanner',
  'gitleaks',
  'ast-grep',
  'semgrep',
  'codeql',
];

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.join('\0') !== actual.join('\0')) {
    throw new TypeError(`${label} keys must be exactly: ${expected.join(', ')}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique`);
}

function parseControl(value, profileId) {
  assertObject(value, `audit profile ${profileId} control`);
  assertExactKeys(value, ['id', 'requirement'], `audit profile ${profileId} control`);
  if (!auditControlIds.includes(value.id)) {
    throw new TypeError(`audit profile ${profileId} has unknown control: ${String(value.id)}`);
  }
  if (!AUDIT_CONTROL_REQUIREMENTS.includes(value.requirement)) {
    throw new TypeError(
      `audit profile ${profileId} control ${value.id} has invalid requirement: ${String(value.requirement)}`
    );
  }
  return { id: value.id, requirement: value.requirement };
}

function assertCompleteControls(profile) {
  const controlIds = profile.controls.map(({ id }) => id);
  assertUnique(controlIds, `audit profile ${profile.id} control ids`);
  const missing = auditControlIds.filter((id) => !controlIds.includes(id));
  if (missing.length > 0) {
    throw new TypeError(`audit profile ${profile.id} is missing controls: ${missing.join(', ')}`);
  }
}

function assertRequiredSecurityEngines(profile) {
  if (!['security', 'release'].includes(profile.id)) return;
  const byId = new Map(profile.controls.map((control) => [control.id, control.requirement]));
  const notRequired = securityEngineIds.filter((id) => byId.get(id) !== 'required');
  if (notRequired.length > 0) {
    throw new TypeError(
      `audit profile ${profile.id} must require security controls: ${notRequired.join(', ')}`
    );
  }
}

function assertCompleteReleaseProfile(profile) {
  if (profile.id !== 'release') return;
  const nonRequired = profile.controls
    .filter(({ requirement }) => requirement !== 'required')
    .map(({ id }) => id);
  if (nonRequired.length > 0) {
    throw new TypeError(
      `audit profile release must require every control: ${nonRequired.join(', ')}`
    );
  }
}

function parseGitleaksScopes(value, profileId) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`audit profile ${profileId} gitleaksScopes must be a non-empty array`);
  }
  for (const scope of value) {
    if (!GITLEAKS_SCOPES.includes(scope)) {
      throw new TypeError(
        `audit profile ${profileId} has invalid Gitleaks scope: ${String(scope)}`
      );
    }
  }
  assertUnique(value, `audit profile ${profileId} Gitleaks scopes`);
  if (['security', 'release'].includes(profileId) && !value.includes('history')) {
    throw new TypeError(`audit profile ${profileId} must scan Git history`);
  }
  return [...value];
}

function parseProfile(value) {
  assertObject(value, 'audit profile');
  assertExactKeys(value, ['id', 'description', 'gitleaksScopes', 'controls'], 'audit profile');
  if (!AUDIT_PROFILE_IDS.includes(value.id)) {
    throw new TypeError(`unknown audit profile: ${String(value.id)}`);
  }
  assertNonEmptyString(value.description, `audit profile ${value.id} description`);
  if (!Array.isArray(value.controls)) {
    throw new TypeError(`audit profile ${value.id} controls must be an array`);
  }
  const profile = {
    id: value.id,
    description: value.description,
    gitleaksScopes: parseGitleaksScopes(value.gitleaksScopes, value.id),
    controls: value.controls.map((control) => parseControl(control, value.id)),
  };
  assertCompleteControls(profile);
  assertRequiredSecurityEngines(profile);
  assertCompleteReleaseProfile(profile);
  return profile;
}

export function parseAuditProfiles(value) {
  assertObject(value, 'audit profiles');
  assertExactKeys(value, ['schemaVersion', 'defaultProfile', 'profiles'], 'audit profiles');
  if (value.schemaVersion !== AUDIT_PROFILE_SCHEMA_VERSION) {
    throw new TypeError(`unsupported audit profile schema version: ${String(value.schemaVersion)}`);
  }
  if (!AUDIT_PROFILE_IDS.includes(value.defaultProfile)) {
    throw new TypeError(`invalid default audit profile: ${String(value.defaultProfile)}`);
  }
  if (!Array.isArray(value.profiles)) throw new TypeError('audit profiles must be an array');
  const profiles = value.profiles.map(parseProfile);
  const profileIds = profiles.map(({ id }) => id);
  assertUnique(profileIds, 'audit profile ids');
  const missingProfiles = AUDIT_PROFILE_IDS.filter((id) => !profileIds.includes(id));
  if (missingProfiles.length > 0) {
    throw new TypeError(`missing audit profiles: ${missingProfiles.join(', ')}`);
  }
  if (!profileIds.includes(value.defaultProfile)) {
    throw new TypeError(`default audit profile is not declared: ${value.defaultProfile}`);
  }
  return { schemaVersion: value.schemaVersion, defaultProfile: value.defaultProfile, profiles };
}
