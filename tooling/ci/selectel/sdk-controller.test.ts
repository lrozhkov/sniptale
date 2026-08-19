import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { expect, it } from 'vitest';

import { validateSelectelQaProfiles } from './policy.mjs';

const source = fs.readFileSync('tooling/ci/selectel/sdk-controller.py', 'utf8');
const dockerfile = fs.readFileSync('tooling/ci/selectel/Dockerfile.controller', 'utf8');
const toolchain = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));

it('keeps cloud protocols in the pinned official OpenStack SDK', () => {
  expect(source).toContain('openstack.connection.Connection(');
  expect(source).toContain('connection.compute.create_server(');
  expect(source).toContain('connection.block_storage.create_volume(');
  expect(source).toContain('connection.network.create_port(');
  expect(source).toContain('connection.compute.availability_zones(details=False)');
  expect(source).not.toContain('availability_zones(details=True)');
  expect(source).not.toContain('/v2.0/');
  expect(source).not.toContain('/servers/detail');
  expect(source).not.toContain('quota-manager');
  expect(source).toContain('resource creation is authoritative; quotas are not inferred');
});

it('binds preemptibility, private networking, JIT, cleanup, and TTL proof', () => {
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/selectel-runner.json', 'utf8'));
  expect(policy.compute.allowedZones).toEqual(['ru-3a', 'ru-3b']);
  expect(policy.compute.allowedBootVolumeGiB).toEqual([80]);
  expect(policy.compute.allowedVolumeTypesByZone).toEqual({
    'ru-3a': ['universal.ru-3a'],
    'ru-3b': ['basicssd.ru-3b'],
  });
  expect(policy.compute).not.toHaveProperty('attemptPlacements');
  expect(policy.imageSelector).toEqual({ name: 'Ubuntu 24.04 LTS 64-bit' });
  expect(source).toContain('item.name == placement["flavor"]');
  expect(source).toContain('flavor.disk != 0');
  expect(source).toContain('int(image.min_disk or 0) > placement["volumeGiB"]');
  expect(source).toContain('result["message"] = " ".join(message.split())[:500]');
  expect(source).toContain('record["failure"] = server_failure(');
  expect(source).toContain('cleanup_with_retries(');
  expect(source).toContain('for profile_index, placement in enumerate(profiles):');
  expect(source).toContain('read_profiles(policy)');
  expect(source).toContain('profilesDigest');
  expect(source).toContain('selectedProfileIndex');
  expect(source).not.toContain('fault.get("details")');
  expect(source).toContain('tags=["preemptible"]');
  expect(source).toContain('delete_on_termination": True');
  expect(source).toContain('server unexpectedly has a public floating IP');
  expect(source).toContain('generate-jitconfig');
  expect(source).toContain('wait_runner_online');
  expect(source).toContain('wait_for_delete');
  expect(source).toContain('sniptale-selectel-sweep-proof');
  expect(source).toContain('port.device_id not in live_server_ids');
  expect(source).toContain('volume_type=selected["volume_type"].name');
  expect(source).not.toContain('print(jit_config');
  expect(source).not.toContain('SELECTEL_OS_PROJECT_ID');
});

it('locks the controller image and complete SDK dependency closure', () => {
  const requirements = fs.readFileSync('tooling/configs/ci/openstack-controller-requirements.lock');
  expect(dockerfile).toContain(`FROM ${toolchain.openstackController.image}`);
  expect(dockerfile).toContain('--require-hashes');
  expect(requirements.toString()).toContain(
    `openstacksdk==${toolchain.openstackController.openstacksdkVersion}`
  );
  expect(crypto.createHash('sha256').update(requirements).digest('hex')).toBe(
    toolchain.openstackController.requirementsSha256
  );
});

it('is valid Python without importing controller dependencies on the host', () => {
  const result = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
    input: source,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
});

it('continues cloud cleanup when GitHub runner deletion fails and preserves partial proof', () => {
  const result = spawnSync(
    'python3',
    ['tooling/ci/selectel/sdk-controller-cleanup.test.py', 'runner-api-failure'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    ports: 'deleted',
    runner: 'failed',
    server: 'deleted',
    volumes: 'deleted',
  });
});

it('writes a replayable cleanup-failed receipt when all retries are exhausted', () => {
  const result = spawnSync(
    'python3',
    ['tooling/ci/selectel/sdk-controller-cleanup.test.py', 'receipt-failure'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).status).toBe('cleanup-failed');
});

const validProfiles = {
  profiles: [
    {
      zone: 'ru-3a',
      flavor: 'SL1.24-49152',
      volumeType: 'universal.ru-3a',
      volumeGiB: 80,
      qa: {
        cpuTokens: 24,
        memoryMiB: 36864,
        vitestWorkers: 16,
        playwrightWorkers: 4,
        securityWorkers: 8,
      },
    },
    {
      zone: 'ru-3a',
      flavor: 'SL1.12-24576',
      volumeType: 'universal.ru-3a',
      volumeGiB: 80,
      qa: {
        cpuTokens: 12,
        memoryMiB: 18432,
        vitestWorkers: 8,
        playwrightWorkers: 4,
        securityWorkers: 6,
      },
    },
  ],
};

function validateWithPythonController(raw: string | undefined) {
  const script = [
    'import json,runpy,sys,types',
    'module=types.ModuleType("openstack")',
    'module.connection=types.SimpleNamespace(Connection=object)',
    'module.exceptions=types.SimpleNamespace(SDKException=Exception)',
    'sys.modules["openstack"]=module',
    'namespace=runpy.run_path("tooling/ci/selectel/sdk-controller.py", run_name="sniptale_test")',
    'profiles,digest=namespace["read_profiles"](namespace["read_policy"]())',
    'print(json.dumps({"profiles":profiles,"digest":digest},sort_keys=True))',
  ].join(';');
  return spawnSync('python3', ['-c', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SNIPTALE_REPOSITORY_ROOT: process.cwd(),
      ...(raw === undefined ? {} : { SELECTEL_QA_PROFILES: raw }),
    },
    encoding: 'utf8',
  });
}

it('validates and hashes the ordered runtime profile document without storing its value', () => {
  const validated = validateSelectelQaProfiles(JSON.stringify(validProfiles));
  expect(validated.profiles).toHaveLength(2);
  expect(validated.digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  const python = validateWithPythonController(JSON.stringify(validProfiles));
  expect(python.status, python.stderr).toBe(0);
  expect(JSON.parse(python.stdout).digest).toBe(validated.digest);
});

it.each([
  ['missing', undefined],
  ['malformed', '{'],
  ['empty', JSON.stringify({ profiles: [] })],
  ['unknown root field', JSON.stringify({ ...validProfiles, fallback: true })],
  [
    'unknown profile field',
    JSON.stringify({ profiles: [{ ...validProfiles.profiles[0], extra: 1 }] }),
  ],
  ['unknown zone', JSON.stringify({ profiles: [{ ...validProfiles.profiles[0], zone: 'ru-9z' }] })],
  [
    'unknown flavor',
    JSON.stringify({ profiles: [{ ...validProfiles.profiles[0], flavor: 'custom' }] }),
  ],
  [
    'wrong volume type',
    JSON.stringify({ profiles: [{ ...validProfiles.profiles[0], volumeType: 'basic.ru-3a' }] }),
  ],
  [
    'invalid workers',
    JSON.stringify({
      profiles: [
        { ...validProfiles.profiles[0], qa: { ...validProfiles.profiles[0].qa, vitestWorkers: 0 } },
      ],
    }),
  ],
  [
    'oversubscribed resources',
    JSON.stringify({
      profiles: [
        { ...validProfiles.profiles[0], qa: { ...validProfiles.profiles[0].qa, cpuTokens: 25 } },
      ],
    }),
  ],
  [
    'duplicate profiles',
    JSON.stringify({ profiles: [validProfiles.profiles[0], validProfiles.profiles[0]] }),
  ],
])('rejects %s runtime profiles', (_label, raw) => {
  expect(() => validateSelectelQaProfiles(raw)).toThrow();
  expect(validateWithPythonController(raw).status).not.toBe(0);
});
