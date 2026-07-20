import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { AUDIT_STEPS } from '../../core/qa-steps/definitions.data.mjs';
import { createNegativeAuditProfileFixtures } from './negative-fixtures.mjs';
import { loadAuditProfiles, resolveAuditProfile } from './registry.mjs';
import { parseAuditProfiles } from './schema.mjs';

const rawProfiles = JSON.parse(
  fs.readFileSync('tooling/configs/qa/audit-profiles.data.json', 'utf8')
);

describe('audit profile schema', () => {
  it('binds every profile to the complete canonical audit control set', () => {
    const registry = loadAuditProfiles();
    const canonicalIds = AUDIT_STEPS.map(([id]) => id).sort();

    expect(registry.defaultProfile).toBe('repository');
    expect(registry.profiles.map(({ id }) => id).sort()).toEqual([
      'release',
      'repository',
      'security',
    ]);
    for (const profile of registry.profiles) {
      expect(profile.controls.map(({ id }) => id).sort()).toEqual(canonicalIds);
    }
  });

  it('requires security engines and worktree plus history secret scans for strict profiles', () => {
    for (const profileId of ['security', 'release']) {
      const profile = resolveAuditProfile(profileId);
      expect(profile.gitleaksScopes).toEqual(['worktree', 'history']);
      for (const controlId of [
        'npm-audit',
        'npm-audit-signatures',
        'osv-scanner',
        'gitleaks',
        'ast-grep',
        'semgrep',
        'codeql',
      ]) {
        expect(profile.controls.get(controlId)?.requirement).toBe('required');
      }
    }
  });

  it.each(createNegativeAuditProfileFixtures(rawProfiles))(
    'rejects $id',
    ({ create, expected }) => {
      expect(() => parseAuditProfiles(create())).toThrow(expected);
    }
  );
});
