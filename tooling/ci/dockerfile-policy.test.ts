import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const FORBIDDEN_APT_PATTERNS = Object.freeze([
  {
    smell: 'TLS peer verification disabled',
    pattern: /Acquire::https::Verify-Peer\s+["']?false/iu,
  },
  { smell: 'unsigned packages admitted', pattern: /--allow-unauthenticated\b/iu },
  { smell: 'repository signature trust bypassed', pattern: /\btrusted\s*=\s*yes\b/iu },
  {
    smell: 'insecure repositories admitted',
    pattern: /Acquire::AllowInsecureRepositories\s+["']?true/iu,
  },
]);

function findDockerfileAptPolicyViolations(source: string) {
  const violations = FORBIDDEN_APT_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
    ({ smell }) => smell
  );
  if (!source.includes('test -s /etc/ssl/certs/ca-certificates.crt')) {
    violations.push('HTTPS APT starts without proving a CA bundle');
  }
  if (!/deb https:\/\/snapshot\.debian\.org\//u.test(source)) {
    violations.push('Debian snapshot transport is not HTTPS');
  }
  return violations;
}

const secureBootstrap = `
deb https://snapshot.debian.org/archive/debian/20260829T000000Z bookworm main
test -s /etc/ssl/certs/ca-certificates.crt
apt-get update
`;

describe('QA image APT policy', () => {
  it('keeps TLS peer and Debian signature verification enabled in the canonical Dockerfile', () => {
    const dockerfile = fs.readFileSync('tooling/ci/Dockerfile', 'utf8');
    expect(findDockerfileAptPolicyViolations(dockerfile)).toEqual([]);
  });

  it.each([
    ['TLS peer verification disabled', 'Acquire::https::Verify-Peer "false";'],
    ['unsigned packages admitted', 'apt-get --allow-unauthenticated install curl'],
    ['repository signature trust bypassed', 'deb [trusted=yes] https://snapshot.debian.org/ x y'],
    ['insecure repositories admitted', 'Acquire::AllowInsecureRepositories "true";'],
  ])('identifies the %s smell', (smell, unsafeDirective) => {
    expect(findDockerfileAptPolicyViolations(`${secureBootstrap}\n${unsafeDirective}`)).toContain(
      smell
    );
  });

  it('rejects HTTPS bootstrap when the CA bundle is not proven first', () => {
    expect(
      findDockerfileAptPolicyViolations(
        'deb https://snapshot.debian.org/archive/debian/20260829T000000Z bookworm main'
      )
    ).toContain('HTTPS APT starts without proving a CA bundle');
  });
});
