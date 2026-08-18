import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { expect, it } from 'vitest';

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
