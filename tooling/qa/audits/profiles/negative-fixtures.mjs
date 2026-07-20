function profile(value, id) {
  return value.profiles.find((entry) => entry.id === id);
}

function control(value, profileId, controlId) {
  return profile(value, profileId).controls.find((entry) => entry.id === controlId);
}

function createShapeFixtures(validValue) {
  return [
    {
      id: 'unknown-root-property',
      expected: /keys must be exactly/u,
      create() {
        return { ...structuredClone(validValue), allowMissingTools: true };
      },
    },
    {
      id: 'missing-control',
      expected: /missing controls: codeql/u,
      create() {
        const value = structuredClone(validValue);
        profile(value, 'repository').controls = profile(value, 'repository').controls.filter(
          ({ id }) => id !== 'codeql'
        );
        return value;
      },
    },
    {
      id: 'duplicate-control',
      expected: /control ids must be unique/u,
      create() {
        const value = structuredClone(validValue);
        profile(value, 'repository').controls.push({ id: 'codeql', requirement: 'optional' });
        return value;
      },
    },
    {
      id: 'optional-required-security-engine',
      expected: /must require security controls: codeql/u,
      create() {
        const value = structuredClone(validValue);
        control(value, 'security', 'codeql').requirement = 'optional';
        return value;
      },
    },
  ];
}

function createPolicyFixtures(validValue) {
  return [
    {
      id: 'history-scan-removed',
      expected: /security must scan Git history/u,
      create() {
        const value = structuredClone(validValue);
        profile(value, 'security').gitleaksScopes = ['worktree'];
        return value;
      },
    },
    {
      id: 'release-control-made-optional',
      expected: /release must require every control: full-product-coverage/u,
      create() {
        const value = structuredClone(validValue);
        control(value, 'release', 'full-product-coverage').requirement = 'optional';
        return value;
      },
    },
    {
      id: 'invalid-control-requirement',
      expected: /invalid requirement/u,
      create() {
        const value = structuredClone(validValue);
        control(value, 'repository', 'codeql').requirement = 'allow-failure';
        return value;
      },
    },
  ];
}

export function createNegativeAuditProfileFixtures(validValue) {
  return [...createShapeFixtures(validValue), ...createPolicyFixtures(validValue)];
}
