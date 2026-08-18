import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { collectSelectelPreflight } from './preflight.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const env = {
  SELECTEL_OS_AUTH_URL: 'https://identity.example/v3',
  SELECTEL_OS_REGION_NAME: 'ru-1',
  SELECTEL_OS_PROJECT_ID: 'project-1',
  SELECTEL_OS_APPLICATION_CREDENTIAL_ID: 'credential-id',
  SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET: 'credential-secret',
};

function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

function createFetch({ cores = 32 }: { cores?: number } = {}) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/auth/tokens')) {
      return json(
        {
          token: {
            project: { id: 'project-1' },
            catalog: ['compute', 'image', 'network', 'volumev3'].map((type) => ({
              type,
              endpoints: [{ interface: 'public', region: 'ru-1', url: `https://${type}.example` }],
            })),
          },
        },
        { headers: { 'x-subject-token': 'ephemeral-token' } }
      );
    }
    if (url.endsWith('/limits')) {
      return json({
        limits: {
          absolute: {
            maxTotalCores: cores,
            totalCoresUsed: 0,
            maxTotalRAMSize: 65536,
            totalRAMUsed: 0,
          },
        },
      });
    }
    if (url.includes('/os-quota-sets/'))
      return json({ quota_set: { gigabytes: 260, gigabytes_used: 0 } });
    if (url.endsWith('/flavors/detail'))
      return json({ flavors: [{ id: 'flavor-1', name: 'canonical', vcpus: 24, ram: 49152 }] });
    if (url.endsWith('/os-availability-zone'))
      return json({
        availabilityZoneInfo: [{ zoneName: 'ru-1a', zoneState: { available: true } }],
      });
    if (url.includes('/v2/images?'))
      return json({
        images: [
          {
            id: 'image-1',
            name: 'Ubuntu 24.04 LTS',
            status: 'active',
            architecture: 'x86_64',
            os_distro: 'ubuntu',
            os_version: '24.04',
            created_at: '2026-01-01',
          },
        ],
      });
    if (url.includes('/v2.0/networks?'))
      return json({ networks: [{ id: 'external-1', name: 'external', 'router:external': true }] });
    throw new Error(`Unexpected URL: ${url}`);
  };
}

it('produces a sanitized read-only connectivity proof for exact canonical resources', async () => {
  const proof = await collectSelectelPreflight({ root, env, fetchImpl: createFetch() });
  expect(proof).toMatchObject({
    artifactKind: 'sniptale-selectel-connectivity-proof',
    region: 'ru-1',
    availabilityZone: 'ru-1a',
    flavor: { id: 'flavor-1', vcpus: 24, ramMiB: 49152 },
    image: { id: 'image-1' },
    externalNetwork: { id: 'external-1' },
  });
  expect(JSON.stringify(proof)).not.toContain('credential-secret');
  expect(JSON.stringify(proof)).not.toContain('ephemeral-token');
  expect(proof.projectFingerprint).toMatch(/^[a-f0-9]{64}$/u);
});

it('fails closed when the project cannot fit one canonical runner', async () => {
  await expect(
    collectSelectelPreflight({ root, env, fetchImpl: createFetch({ cores: 23 }) })
  ).rejects.toThrow('insufficient free canonical runner quota');
});

it('fails closed when quota usage is missing', async () => {
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).endsWith('/limits')) {
      return json({ limits: { absolute: { maxTotalCores: 32, maxTotalRAMSize: 65536 } } });
    }
    return createFetch()(input);
  };
  await expect(collectSelectelPreflight({ root, env, fetchImpl })).rejects.toThrow(
    'quota response is missing required limits'
  );
});

it.each([undefined, 'aarch64'])('rejects image architecture %s', async (architecture) => {
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).includes('/v2/images?')) {
      return json({
        images: [
          {
            id: 'image-1',
            name: 'Ubuntu 24.04 LTS',
            status: 'active',
            architecture,
            os_distro: 'ubuntu',
            os_version: '24.04',
          },
        ],
      });
    }
    return createFetch()(input);
  };
  await expect(collectSelectelPreflight({ root, env, fetchImpl })).rejects.toThrow(
    'No active Ubuntu 24.04 LTS amd64 image'
  );
});

it('keeps connectivity secrets on the trusted main dispatch only', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality-gate.yml'), 'utf8');
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("with: { ref: '${{ github.sha }}', persist-credentials: false }");
});

it('does not include a rejected credential or response body in errors', async () => {
  const fetchImpl = async () => new Response('credential-secret provider detail', { status: 401 });
  await expect(collectSelectelPreflight({ root, env, fetchImpl })).rejects.toThrow(
    'authentication failed with HTTP 401'
  );
  await expect(collectSelectelPreflight({ root, env, fetchImpl })).rejects.not.toThrow(
    'credential-secret'
  );
});
