import fs from 'node:fs';

import { fromRelativePath } from '../../core/shared.mjs';
import { parseAuditProfiles } from './schema.mjs';

export const AUDIT_PROFILES_PATH = 'tooling/configs/qa/audit-profiles.data.json';

export function loadAuditProfiles({ path = fromRelativePath(AUDIT_PROFILES_PATH) } = {}) {
  return parseAuditProfiles(JSON.parse(fs.readFileSync(path, 'utf8')));
}

export function resolveAuditProfile(profileId, options) {
  const registry = loadAuditProfiles(options);
  const resolvedId = profileId ?? registry.defaultProfile;
  const profile = registry.profiles.find(({ id }) => id === resolvedId);
  if (!profile) throw new TypeError(`unknown audit profile: ${String(resolvedId)}`);
  return {
    ...profile,
    controls: new Map(profile.controls.map((control) => [control.id, control])),
  };
}
