import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { AUDIT_STEPS } from '../../composition/catalog/definitions.data.mjs';
import { loadAuditProfiles, resolveAuditProfile } from './registry.mjs';
import { parseAuditProfiles } from './schema.mjs';

type MutableAuditProfile = {
  id: string;
  description: string;
  gitleaksScopes: string[];
  controls: Array<{ id: string; requirement: string }>;
};

type MutableAuditProfiles = {
  schemaVersion: number;
  defaultProfile: string;
  profiles: MutableAuditProfile[];
  allowMissingTools?: boolean;
};

const rawProfiles = JSON.parse(
  fs.readFileSync('tooling/configs/qa/audit-profiles.data.json', 'utf8')
) as MutableAuditProfiles;

function profile(value: MutableAuditProfiles, id: string): MutableAuditProfile {
  const result = value.profiles.find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing test profile: ${id}`);
  return result;
}

function control(value: MutableAuditProfiles, profileId: string, controlId: string) {
  const result = profile(value, profileId).controls.find((entry) => entry.id === controlId);
  if (!result) throw new Error(`Missing test control: ${profileId}/${controlId}`);
  return result;
}

function negativeFixture(
  id: string,
  expected: RegExp,
  mutate: (value: MutableAuditProfiles) => void
) {
  return {
    id,
    expected,
    create() {
      const value = structuredClone(rawProfiles);
      mutate(value);
      return value;
    },
  };
}

const negativeFixtures = [
  negativeFixture('unknown-root-property', /keys must be exactly/u, (value) => {
    value.allowMissingTools = true;
  }),
  negativeFixture('invalid-default-profile', /invalid default audit profile/u, (value) => {
    value.defaultProfile = 'unknown';
  }),
  negativeFixture('missing-profile', /missing audit profiles: coverage/u, (value) => {
    value.profiles = value.profiles.filter(({ id }) => id !== 'coverage');
  }),
  negativeFixture('duplicate-profile', /audit profile ids must be unique/u, (value) => {
    value.profiles.push(structuredClone(profile(value, 'coverage')));
  }),
  negativeFixture('empty-description', /description must be a non-empty string/u, (value) => {
    profile(value, 'repository').description = ' ';
  }),
  negativeFixture('unknown-control', /unknown control/u, (value) => {
    profile(value, 'repository').controls[0].id = 'unknown-control';
  }),
  negativeFixture('missing-control', /missing controls: codeql/u, (value) => {
    profile(value, 'repository').controls = profile(value, 'repository').controls.filter(
      ({ id }) => id !== 'codeql'
    );
  }),
  negativeFixture('duplicate-control', /control ids must be unique/u, (value) => {
    profile(value, 'repository').controls.push({ id: 'codeql', requirement: 'optional' });
  }),
  negativeFixture(
    'optional-required-security-engine',
    /must require security controls: codeql/u,
    (value) => {
      control(value, 'security', 'codeql').requirement = 'optional';
    }
  ),
  negativeFixture('empty-gitleaks-scopes', /gitleaksScopes must be a non-empty array/u, (value) => {
    profile(value, 'repository').gitleaksScopes = [];
  }),
  negativeFixture('duplicate-gitleaks-scope', /Gitleaks scopes must be unique/u, (value) => {
    profile(value, 'repository').gitleaksScopes = ['worktree', 'worktree'];
  }),
  negativeFixture('invalid-gitleaks-scope', /invalid Gitleaks scope/u, (value) => {
    profile(value, 'repository').gitleaksScopes = ['index'];
  }),
  negativeFixture('history-scan-removed', /security must scan Git history/u, (value) => {
    profile(value, 'security').gitleaksScopes = ['worktree'];
  }),
  negativeFixture(
    'release-control-made-optional',
    /release must require every control: full-product-coverage/u,
    (value) => {
      control(value, 'release', 'full-product-coverage').requirement = 'optional';
    }
  ),
  negativeFixture('invalid-control-requirement', /invalid requirement/u, (value) => {
    control(value, 'repository', 'codeql').requirement = 'allow-failure';
  }),
  negativeFixture(
    'repository-control-excluded',
    /repository has invalid controls: knip/u,
    (value) => {
      control(value, 'repository', 'knip').requirement = 'excluded';
    }
  ),
];

describe('audit profile schema', () => {
  it('binds every profile to the complete canonical audit control set', () => {
    const registry = loadAuditProfiles();
    const canonicalIds = AUDIT_STEPS.map(([id]) => id).sort();

    expect(registry.defaultProfile).toBe('repository');
    expect(registry.profiles.map(({ id }) => id).sort()).toEqual([
      'coverage',
      'pr',
      'release',
      'repository',
      'security',
    ]);
    for (const profile of registry.profiles) {
      expect(profile.controls.map(({ id }) => id).sort()).toEqual(canonicalIds);
    }
  });

  it('keeps the coverage profile isolated from every non-coverage control', () => {
    const profile = resolveAuditProfile('coverage');
    expect(profile.controls.get('full-product-coverage')?.requirement).toBe('required');
    expect(
      [...profile.controls.entries()]
        .filter(([id]) => id !== 'full-product-coverage')
        .every(([, control]) => control.requirement === 'excluded')
    ).toBe(true);
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
        'codeql',
      ]) {
        expect(profile.controls.get(controlId)?.requirement).toBe('required');
      }
    }
  });

  it('runs OSV and npm vulnerability resolution in Fast and full profiles', () => {
    const pr = resolveAuditProfile('pr');
    expect(pr.controls.get('osv-scanner')?.requirement).toBe('required');
    expect(pr.controls.get('npm-audit')?.requirement).toBe('required');
    expect(pr.controls.get('npm-audit-signatures')?.requirement).toBe('required');

    for (const profileId of ['repository', 'security', 'release']) {
      const profile = resolveAuditProfile(profileId);
      expect(profile.controls.get('osv-scanner')?.requirement).toBe('required');
      expect(profile.controls.get('npm-audit')?.requirement).toBe('required');
      expect(profile.controls.get('npm-audit-signatures')?.requirement).toBe('required');
    }
  });

  it('fails closed for an unknown requested profile', () => {
    expect(() => resolveAuditProfile('unknown')).toThrow(/unknown audit profile/u);
  });

  it.each(negativeFixtures)('rejects $id', ({ create, expected }) => {
    expect(() => parseAuditProfiles(create())).toThrow(expected);
  });
});
