import fs from 'node:fs';
import path from 'node:path';

export const SELECTEL_POLICY_PATH = 'tooling/configs/ci/selectel-runner.json';

export function readSelectelPolicy(root = process.cwd()) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, SELECTEL_POLICY_PATH), 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-selectel-runner-policy' ||
    policy.environment !== 'selectel-runner-controller' ||
    policy.compute?.vcpus !== 24 ||
    policy.compute?.ramMiB !== 49152 ||
    policy.compute?.bootVolumeGiB !== 180 ||
    policy.compute?.preemptible !== true ||
    policy.compute?.publicIp !== false ||
    policy.compute?.ingress !== false ||
    policy.imageSelector?.name !== 'Ubuntu 24.04 LTS' ||
    policy.imageSelector?.osDistro !== 'ubuntu' ||
    policy.imageSelector?.osVersion !== '24.04' ||
    !Array.isArray(policy.imageSelector?.architectures) ||
    policy.imageSelector.architectures.join(',') !== 'x86_64,amd64' ||
    policy.lifecycle?.attempts !== 3 ||
    policy.lifecycle?.ttlSeconds !== 10800 ||
    policy.runner?.maxJobs !== 1 ||
    !/^[a-f0-9]{64}$/u.test(policy.controllerEnvironment?.expectedProjectSha256 ?? '') ||
    !/^[a-f0-9]{64}$/u.test(policy.runner?.sha256 ?? '')
  ) {
    throw new Error('Malformed Selectel runner policy.');
  }
  return policy;
}
