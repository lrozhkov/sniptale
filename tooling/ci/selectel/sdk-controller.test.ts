import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { expect, it } from 'vitest';

import { validateSelectelProfilesForLane, validateSelectelQaProfiles } from './policy.mjs';

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
  expect(policy.compute).not.toHaveProperty('allowedZones');
  expect(policy.compute).not.toHaveProperty('allowedFlavors');
  expect(policy.compute).not.toHaveProperty('allowedBootVolumeGiB');
  expect(policy.compute).not.toHaveProperty('allowedVolumeTypesByZone');
  expect(policy.compute).not.toHaveProperty('allowedResourceProfilesByFlavor');
  expect(policy.compute).not.toHaveProperty('attemptPlacements');
  expect(policy.network).toEqual({
    subnetCidr: '10.77.0.0/24',
    lifecycle: 'disposable-per-attempt',
    securityGroupNamePrefix: 'sniptale-github-actions-no-ingress',
  });
  expect(policy.trust.persistentNetworkResources).toBe(false);
  expect(policy.imageSelector).toEqual({ name: 'Ubuntu 24.04 LTS 64-bit' });
  expect(source).toContain('item.name == placement["flavor"]');
  expect(source).toContain('flavor.disk != 0');
  expect(source).toContain('int(image.min_disk or 0) > placement["volumeGiB"]');
  expect(source).toContain('result["message"] = redact_failure_message(message, connection)');
  expect(source).toContain('record["failure"] = server_failure(');
  expect(source).toContain('cleanup_with_retries(');
  expect(source).toContain('for profile_index, placement in enumerate(profiles):');
  expect(source).toContain('read_profiles(policy)');
  expect(source).toContain('profilesDigest');
  expect(source).toContain('selectedProfileIndex');
  expect(source).not.toContain('fault.get("details")');
  expect(source).toContain('"tags": ["preemptible"]');
  expect(source).toContain('delete_on_termination": True');
  expect(source).toContain('server unexpectedly has a public floating IP');
  expect(source).toContain('generate-jitconfig');
  expect(source).toContain('wait_runner_online');
  expect(source).toContain('wait_for_delete');
  expect(source).toContain('remove_interface_from_router');
  expect(source).toContain('delete_router');
  expect(source).toContain('delete_subnet');
  expect(source).toContain('delete_network');
  expect(source).toContain('delete_security_group');
  expect(source).toContain('sniptale-selectel-sweep-proof');
  expect(source).toContain('if expired_description(port)');
  expect(source).toContain('runner.get("name") in expired_runner_names');
  expect(source).toContain('volume_type=selected["volume_type"].name');
  expect(source).not.toContain('print(jit_config');
  expect(source).not.toContain('SELECTEL_OS_PROJECT_ID');
  expect(source).not.toContain('RUNNER_IMAGE_TOKEN');
  expect(source).not.toContain('RUNNER_IMAGE_USER');
  expect(source).toContain('token_pattern.fullmatch(package)');
  expect(source).toContain('argument_pattern.fullmatch(argument)');
});

it('keeps reusable GitHub credentials out of user-data and denies candidate metadata access', () => {
  const script = [
    'import base64,runpy,sys,types',
    'module=types.ModuleType("openstack")',
    'module.connection=types.SimpleNamespace(Connection=object)',
    'module.exceptions=types.SimpleNamespace(SDKException=Exception)',
    'sys.modules["openstack"]=module',
    'namespace=runpy.run_path("tooling/ci/selectel/sdk-controller.py", run_name="sniptale_test")',
    'policy=namespace["read_policy"]()',
    'encoded,_=namespace["cloud_init"](policy,"one-shot-jit", "ghcr.io/lrozhkov/sniptale-qa@sha256:" + "a"*64)',
    'print(base64.b64decode(encoded).decode())',
  ].join(';');
  const result = spawnSync('python3', ['-c', script], {
    cwd: process.cwd(),
    env: { ...process.env, SNIPTALE_REPOSITORY_ROOT: process.cwd() },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('docker, pull, ghcr.io/lrozhkov/sniptale-qa@sha256:');
  const hostTools = JSON.parse(
    fs.readFileSync('tooling/configs/ci/selectel-host-tools.json', 'utf8')
  );
  for (const packageName of hostTools.packages) {
    expect(result.stdout).toContain(packageName);
  }
  expect(hostTools.checks.map((check: { command: string }) => check.command)).toEqual([
    'docker',
    'git',
    'gh',
    'jq',
    'node',
    'npm',
    'npx',
    'tar',
    'zstd',
    'find',
  ]);
  expect(result.stdout).toContain('DOCKER-USER');
  expect(result.stdout).toContain('169.254.169.254/32');
  expect(result.stdout).toContain('iptables --wait --check');
  expect(result.stdout.indexOf('169.254.169.254/32')).toBeLessThan(
    result.stdout.indexOf('./run.sh --jitconfig')
  );
  expect(result.stdout).not.toContain('docker login');
  expect(result.stdout).not.toContain('RUNNER_IMAGE_TOKEN');
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
    network: 'deleted',
    ports: 'deleted',
    router: 'deleted',
    routerPorts: 'deleted',
    runner: 'failed',
    securityGroups: 'deleted',
    server: 'deleted',
    subnet: 'deleted',
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

it('redacts project and credential identities from persisted and console failure text', () => {
  const script = [
    'import json,runpy,sys,types',
    'module=types.ModuleType("openstack")',
    'module.connection=types.SimpleNamespace(Connection=object)',
    'module.exceptions=types.SimpleNamespace(SDKException=Exception)',
    'sys.modules["openstack"]=module',
    'namespace=runpy.run_path("tooling/ci/selectel/sdk-controller.py", run_name="sniptale_test")',
    'message="project-raw-uuid credential-id credential-secret runner-token"',
    'namespace["remember_project_id_for_redaction"]("project-raw-uuid")',
    'print(json.dumps(namespace["cleanup_failure"](RuntimeError(message))))',
  ].join(';');
  const result = spawnSync('python3', ['-c', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SELECTEL_OS_APPLICATION_CREDENTIAL_ID: 'credential-id',
      SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET: 'credential-secret',
      RUNNER_CONTROLLER_TOKEN: 'runner-token',
      SNIPTALE_REPOSITORY_ROOT: process.cwd(),
    },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).not.toMatch(
    /project-raw-uuid|credential-id|credential-secret|runner-token/u
  );
  expect(JSON.parse(result.stdout).message).toContain('[REDACTED]');
});

it('replays cleanup from nested resources after provisioning cleanup was interrupted', () => {
  const result = spawnSync(
    'python3',
    ['tooling/ci/selectel/sdk-controller-cleanup.test.py', 'nested-receipt-replay'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );
  expect(result.status, result.stderr).toBe(0);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  expect(receipt.status).toBe('cleaned');
  expect(receipt.attempts[0].status).toBe('cleaned');
});

it('replays cleanup from partial top-level and nested provisioning receipts', () => {
  const result = spawnSync(
    'python3',
    ['tooling/ci/selectel/sdk-controller-cleanup.test.py', 'partial-provisioning-receipt-replay'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({
    cleaned: ['top-level-server', 'nested-server'],
  });
});

it('recovers cleanup by exact run and run-attempt identity when the receipt is unavailable', () => {
  const result = spawnSync(
    'python3',
    ['tooling/ci/selectel/sdk-controller-cleanup.test.py', 'identity-recovery'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
  const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  expect(receipt.status).toBe('cleaned');
  expect(receipt.runAttempt).toBe('3');
});

it('reconciles an ambiguous Nova create without a second POST and preserves cleanup ownership', () => {
  const result = spawnSync(
    'python3',
    ['tooling/ci/selectel/sdk-controller-cleanup.test.py', 'server-create-reconciliation'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({
    cleanup: 'reconciled-for-cleanup',
    missing: null,
    reconciled: 'owned-server',
  });
  expect(source.match(/connection\.compute\.create_server\(/gu)).toHaveLength(1);
  expect(source).toContain(
    'connection = connect(policy)[0]\n            record["serverCreatePostAttempts"] = 1'
  );
  expect(source).not.toContain('connect_retries=');
});

const validProfiles = {
  profiles: [
    {
      zone: 'ru-3b',
      flavor: 'SL1.16-32768',
      volumeType: 'basicssd.ru-3b',
      volumeGiB: 80,
      qa: {
        cpuTokens: 16,
        memoryMiB: 24576,
        vitestWorkers: 12,
        playwrightWorkers: 4,
        securityWorkers: 8,
      },
    },
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
  expect(validated.profiles).toHaveLength(3);
  expect(validated.digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  const python = validateWithPythonController(JSON.stringify(validProfiles));
  expect(python.status, python.stderr).toBe(0);
  expect(JSON.parse(python.stdout).digest).toBe(validated.digest);
});

it('accepts the same environment-owned profiles for proof and release lanes', () => {
  expect(() =>
    validateSelectelProfilesForLane(JSON.stringify(validProfiles), 'proof')
  ).not.toThrow();
  expect(() =>
    validateSelectelProfilesForLane(JSON.stringify(validProfiles), 'release')
  ).not.toThrow();
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
  [
    'invalid workers',
    JSON.stringify({
      profiles: [
        { ...validProfiles.profiles[0], qa: { ...validProfiles.profiles[0].qa, vitestWorkers: 0 } },
      ],
    }),
  ],
  [
    'workers above CPU tokens',
    JSON.stringify({
      profiles: [
        { ...validProfiles.profiles[0], qa: { ...validProfiles.profiles[0].qa, cpuTokens: 4 } },
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

it('leaves zone, flavor, volume, and scheduler capacity to the environment profile', () => {
  const environmentProfile = {
    profiles: [
      {
        zone: 'ru-custom',
        flavor: 'project-owned-flavor',
        volumeType: 'project-owned-volume-type',
        volumeGiB: 96,
        qa: {
          cpuTokens: 20,
          memoryMiB: 30720,
          vitestWorkers: 10,
          playwrightWorkers: 3,
          securityWorkers: 5,
        },
      },
    ],
  };
  const raw = JSON.stringify(environmentProfile);
  expect(validateSelectelProfilesForLane(raw, 'proof').profiles).toEqual(
    environmentProfile.profiles
  );
  expect(validateSelectelProfilesForLane(raw, 'release').profiles).toEqual(
    environmentProfile.profiles
  );
  expect(validateWithPythonController(raw).status).toBe(0);
});
