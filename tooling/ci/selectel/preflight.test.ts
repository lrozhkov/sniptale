import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { collectSelectelPreflight } from './preflight.mjs';
import { readSelectelPolicy } from './policy.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const env = {
  SELECTEL_OS_AUTH_URL: 'https://identity.example/v3',
  SELECTEL_OS_REGION_NAME: 'ru-1',
  SELECTEL_OS_APPLICATION_CREDENTIAL_ID: 'credential-id',
  SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET: 'credential-secret',
};
const policy = structuredClone(readSelectelPolicy(root));
policy.controllerEnvironment.expectedProjectSha256 =
  'a33e35d302125bbd8e647043a4025b29f659aad51c4a80d6244a45fabcdcd235';
policy.controllerEnvironment.expectedRegion = 'ru-1';
policy.controllerEnvironment.quotaManagerUrl = 'https://ru-1.cloud.api.selcloud.ru/quota-manager';

function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

function createFetch({
  cores = 32,
  nestedVolumeQuota = false,
}: { cores?: number; nestedVolumeQuota?: boolean } = {}) {
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
    if (url.startsWith('https://ru-1.cloud.api.selcloud.ru/quota-manager/v1/projects/')) {
      return json({
        quotas: {
          compute_cores: [{ zone: 'ru-1a', value: cores, used: 0 }],
          compute_ram: [{ zone: 'ru-1a', value: 65536, used: 0 }],
        },
      });
    }
    if (url.startsWith('https://volumev3.example/os-quota-sets/')) {
      return json({
        quota_set: nestedVolumeQuota
          ? { gigabytes: { limit: 260, in_use: 0, reserved: 0 } }
          : { gigabytes: 260, gigabytes_used: 0 },
      });
    }
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
  const proof = await collectSelectelPreflight({ root, env, policy, fetchImpl: createFetch() });
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
  expect(proof.project).toMatch(/^sha256:[a-f0-9]{12}$/u);
  expect(JSON.stringify(proof)).not.toContain('project-1');
});

it('accepts the Cinder detailed quota shape without defaulting usage', async () => {
  const proof = await collectSelectelPreflight({
    root,
    env,
    policy,
    fetchImpl: createFetch({ nestedVolumeQuota: true }),
  });
  expect(proof.quotas.freeVolumeGiB).toBe(260);
});

it('fails closed when the project cannot fit one canonical runner', async () => {
  await expect(
    collectSelectelPreflight({ root, env, policy, fetchImpl: createFetch({ cores: 23 }) })
  ).rejects.toThrow('No available Selectel zone has complete canonical runner quota');
});

it('fails closed when quota usage is missing', async () => {
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).startsWith(policy.controllerEnvironment.quotaManagerUrl)) {
      return json({
        quotas: {
          compute_cores: [{ zone: 'ru-1a', value: 32 }],
          compute_ram: [{ zone: 'ru-1a', value: 65536, used: 0 }],
        },
      });
    }
    return createFetch()(input);
  };
  await expect(collectSelectelPreflight({ root, env, policy, fetchImpl })).rejects.toThrow(
    'No available Selectel zone has complete canonical runner quota'
  );
});

it('rejects a quota-manager response without explicit per-zone quota entries', async () => {
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).startsWith(policy.controllerEnvironment.quotaManagerUrl)) {
      return json({ quotas: { compute_cores: 32, compute_ram: 65536 } });
    }
    return createFetch()(input);
  };
  await expect(collectSelectelPreflight({ root, env, policy, fetchImpl })).rejects.toThrow(
    'No available Selectel zone has complete canonical runner quota'
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
  await expect(collectSelectelPreflight({ root, env, policy, fetchImpl })).rejects.toThrow(
    'No active Ubuntu 24.04 LTS amd64 image'
  );
});

it('keeps connectivity secrets on the trusted main dispatch only', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality-gate.yml'), 'utf8');
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("with: { ref: '${{ github.sha }}', persist-credentials: false }");
  expect(workflow).not.toContain('SELECTEL_OS_PROJECT_ID');
});

it('fails closed when the signed token belongs to a different project', async () => {
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).endsWith('/auth/tokens')) {
      return json(
        {
          token: {
            project: { id: 'different-project' },
            catalog: ['compute', 'image', 'network', 'volumev3'].map((type) => ({
              type,
              endpoints: [{ interface: 'public', region: 'ru-1', url: `https://${type}.example` }],
            })),
          },
        },
        { headers: { 'x-subject-token': 'ephemeral-token' } }
      );
    }
    return createFetch()(input);
  };
  await expect(collectSelectelPreflight({ root, env, policy, fetchImpl })).rejects.toThrow(
    'token project does not match policy'
  );
});

it('rejects a controller region outside the machine-owned quota endpoint', async () => {
  await expect(
    collectSelectelPreflight({
      root,
      env: { ...env, SELECTEL_OS_REGION_NAME: 'ru-2' },
      policy,
      fetchImpl: createFetch(),
    })
  ).rejects.toThrow('region does not match policy');
});

it('does not include a rejected credential or response body in errors', async () => {
  const fetchImpl = async () => new Response('credential-secret provider detail', { status: 401 });
  await expect(collectSelectelPreflight({ root, env, policy, fetchImpl })).rejects.toThrow(
    'authentication failed with HTTP 401'
  );
  await expect(collectSelectelPreflight({ root, env, policy, fetchImpl })).rejects.not.toThrow(
    'credential-secret'
  );
});
