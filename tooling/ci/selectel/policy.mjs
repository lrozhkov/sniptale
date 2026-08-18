import fs from 'node:fs';
import path from 'node:path';

export const SELECTEL_POLICY_PATH = 'tooling/configs/ci/selectel-runner.json';

export function readSelectelPolicy(root = process.cwd()) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, SELECTEL_POLICY_PATH), 'utf8'));
  const placementContract = policy.compute?.attemptPlacements?.map((placement) => [
    placement.attempt,
    placement.availabilityZone,
    placement.bootVolumeType,
    placement.flavorName,
    placement.vcpus,
    placement.ramMiB,
    placement.resourceProfile?.id,
    placement.resourceProfile?.cpuTokens,
    placement.resourceProfile?.memoryMiB,
    placement.resourceProfile?.vitestWorkers,
    placement.resourceProfile?.playwrightWorkers,
    placement.resourceProfile?.securityWorkers,
    placement.resourceProfile?.memoryReserveMiB,
  ]);
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-selectel-runner-policy' ||
    policy.environment !== 'selectel-runner-controller' ||
    policy.compute?.bootVolumeGiB !== 80 ||
    JSON.stringify(placementContract) !==
      JSON.stringify([
        [
          1,
          'ru-3a',
          'universal.ru-3a',
          'SL1.24-49152',
          24,
          49152,
          'selectel-24vcpu-48g-v1',
          24,
          36864,
          16,
          4,
          8,
          12288,
        ],
        [
          2,
          'ru-3b',
          'basicssd.ru-3b',
          'SL1.24-49152',
          24,
          49152,
          'selectel-24vcpu-48g-v1',
          24,
          36864,
          16,
          4,
          8,
          12288,
        ],
        [
          3,
          'ru-3a',
          'universal.ru-3a',
          'SL1.12-24576',
          12,
          24576,
          'selectel-12vcpu-24g-v1',
          12,
          18432,
          8,
          4,
          6,
          6144,
        ],
      ]) ||
    policy.compute?.preemptible !== true ||
    policy.compute?.publicIp !== false ||
    policy.compute?.ingress !== false ||
    policy.imageSelector?.name !== 'Ubuntu 24.04 LTS 64-bit' ||
    policy.lifecycle?.attempts !== 3 ||
    policy.lifecycle?.ttlSeconds !== 10800 ||
    policy.runner?.maxJobs !== 1 ||
    !/^[a-f0-9]{64}$/u.test(policy.controllerEnvironment?.expectedProjectSha256 ?? '') ||
    policy.controllerEnvironment?.expectedRegion !== 'ru-3' ||
    !/^[a-f0-9]{64}$/u.test(policy.runner?.sha256 ?? '')
  ) {
    throw new Error('Malformed Selectel runner policy.');
  }
  return policy;
}
