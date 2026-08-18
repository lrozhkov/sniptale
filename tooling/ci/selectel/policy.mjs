import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SELECTEL_POLICY_PATH = 'tooling/configs/ci/selectel-runner.json';

export function readSelectelPolicy(root = process.cwd()) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, SELECTEL_POLICY_PATH), 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-selectel-runner-policy' ||
    policy.environment !== 'selectel-runner-controller' ||
    JSON.stringify(policy.compute?.allowedZones) !== JSON.stringify(['ru-3a', 'ru-3b']) ||
    JSON.stringify(policy.compute?.allowedBootVolumeGiB) !== JSON.stringify([80]) ||
    JSON.stringify(policy.compute?.allowedFlavors) !==
      JSON.stringify({
        'SL1.24-49152': { vcpus: 24, ramMiB: 49152 },
        'SL1.12-24576': { vcpus: 12, ramMiB: 24576 },
      }) ||
    JSON.stringify(policy.compute?.allowedVolumeTypesByZone) !==
      JSON.stringify({ 'ru-3a': ['universal.ru-3a'], 'ru-3b': ['basicssd.ru-3b'] }) ||
    JSON.stringify(policy.compute?.allowedResourceProfilesByFlavor) !==
      JSON.stringify({
        'SL1.24-49152': {
          cpuTokens: 24,
          memoryMiB: 36864,
          vitestWorkers: 16,
          playwrightWorkers: 4,
          securityWorkers: 8,
        },
        'SL1.12-24576': {
          cpuTokens: 12,
          memoryMiB: 18432,
          vitestWorkers: 8,
          playwrightWorkers: 4,
          securityWorkers: 6,
        },
      }) ||
    policy.compute?.preemptible !== true ||
    policy.compute?.publicIp !== false ||
    policy.compute?.ingress !== false ||
    policy.imageSelector?.name !== 'Ubuntu 24.04 LTS 64-bit' ||
    policy.lifecycle?.maxProfiles !== 10 ||
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

export function validateSelectelQaProfiles(raw, root = process.cwd()) {
  if (typeof raw !== 'string' || raw.length === 0)
    throw new Error('SELECTEL_QA_PROFILES is missing.');
  const policy = readSelectelPolicy(root);
  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    throw new Error('SELECTEL_QA_PROFILES is malformed JSON.');
  }
  if (!document || Array.isArray(document) || Object.keys(document).join('\0') !== 'profiles') {
    throw new Error('SELECTEL_QA_PROFILES must contain only profiles.');
  }
  if (!Array.isArray(document.profiles) || document.profiles.length === 0) {
    throw new Error('SELECTEL_QA_PROFILES profiles must be a non-empty array.');
  }
  if (document.profiles.length > policy.lifecycle.maxProfiles)
    throw new Error('SELECTEL_QA_PROFILES exceeds the bounded profile count.');
  const expectedProfileKeys = ['flavor', 'qa', 'volumeGiB', 'volumeType', 'zone'];
  const expectedQaKeys = [
    'cpuTokens',
    'memoryMiB',
    'playwrightWorkers',
    'securityWorkers',
    'vitestWorkers',
  ];
  const normalizedProfiles = document.profiles.map((profile, index) => {
    if (
      !profile ||
      Array.isArray(profile) ||
      Object.keys(profile).sort().join('\0') !== expectedProfileKeys.join('\0')
    ) {
      throw new Error(`Selectel profile ${index} has unknown or missing fields.`);
    }
    if (
      !profile.qa ||
      Array.isArray(profile.qa) ||
      Object.keys(profile.qa).sort().join('\0') !== expectedQaKeys.join('\0')
    ) {
      throw new Error(`Selectel profile ${index} QA resources are malformed.`);
    }
    if (Object.values(profile.qa).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`Selectel profile ${index} QA resources must be positive integers.`);
    }
    const flavor = policy.compute.allowedFlavors[profile.flavor];
    if (!policy.compute.allowedZones.includes(profile.zone) || !flavor)
      throw new Error(`Selectel profile ${index} uses an unknown zone or flavor.`);
    if (!policy.compute.allowedVolumeTypesByZone[profile.zone]?.includes(profile.volumeType))
      throw new Error(`Selectel profile ${index} uses an unknown volume type for its zone.`);
    if (!policy.compute.allowedBootVolumeGiB.includes(profile.volumeGiB))
      throw new Error(`Selectel profile ${index} uses an unsupported volume size.`);
    const allowedQa = policy.compute.allowedResourceProfilesByFlavor[profile.flavor];
    if (expectedQaKeys.some((key) => profile.qa[key] !== allowedQa[key]))
      throw new Error(`Selectel profile ${index} uses an unknown flavor/resource combination.`);
    return {
      zone: profile.zone,
      flavor: profile.flavor,
      volumeType: profile.volumeType,
      volumeGiB: profile.volumeGiB,
      qa: profile.qa,
    };
  });
  const keys = normalizedProfiles.map((profile) => JSON.stringify(profile));
  if (new Set(keys).size !== keys.length)
    throw new Error('SELECTEL_QA_PROFILES contains duplicate profiles.');
  const stable = (value) =>
    JSON.stringify(value, (_key, nested) =>
      nested && typeof nested === 'object' && !Array.isArray(nested)
        ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)))
        : nested
    );
  const normalized = stable({ profiles: normalizedProfiles });
  return {
    digest: `sha256:${crypto.createHash('sha256').update(normalized).digest('hex')}`,
    profiles: normalizedProfiles,
  };
}
