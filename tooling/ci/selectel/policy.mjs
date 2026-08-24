import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { stableStringify } from '../../qa/core/proof-input.mjs';

export const SELECTEL_POLICY_PATH = 'tooling/configs/ci/selectel-runner.json';

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasPositiveFields(value, fields) {
  return (
    value &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...fields].sort().join('\0') &&
    fields.every((field) => isPositiveInteger(value[field]))
  );
}

export function readSelectelPolicy(root = process.cwd()) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, SELECTEL_POLICY_PATH), 'utf8'));
  const compute = policy?.compute;
  const flavors = Object.entries(compute?.allowedFlavors ?? {});
  const profiles = compute?.allowedResourceProfilesByFlavor ?? {};
  const zones = compute?.allowedZones;
  const volumeTypes = compute?.allowedVolumeTypesByZone ?? {};
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-selectel-runner-policy' ||
    policy.environment !== 'selectel-runner-controller' ||
    !Array.isArray(zones) ||
    zones.length === 0 ||
    zones.some((zone) => typeof zone !== 'string' || zone.length === 0) ||
    new Set(zones).size !== zones.length ||
    !Array.isArray(compute?.allowedBootVolumeGiB) ||
    compute.allowedBootVolumeGiB.length === 0 ||
    !compute.allowedBootVolumeGiB.every(isPositiveInteger) ||
    flavors.length === 0 ||
    flavors.some(([, flavor]) => !hasPositiveFields(flavor, ['vcpus', 'ramMiB'])) ||
    Object.keys(profiles).sort().join('\0') !==
      flavors
        .map(([name]) => name)
        .sort()
        .join('\0') ||
    Object.values(profiles).some(
      (profile) =>
        !hasPositiveFields(profile, [
          'cpuTokens',
          'memoryMiB',
          'vitestWorkers',
          'playwrightWorkers',
          'securityWorkers',
        ])
    ) ||
    flavors.some(([name, flavor]) => {
      const profile = profiles[name];
      return (
        profile.cpuTokens > flavor.vcpus ||
        profile.memoryMiB >= flavor.ramMiB ||
        flavor.ramMiB - profile.memoryMiB < 6144 ||
        ['vitestWorkers', 'playwrightWorkers', 'securityWorkers'].some(
          (worker) => profile[worker] > profile.cpuTokens
        )
      );
    }) ||
    Object.keys(volumeTypes).sort().join('\0') !== [...zones].sort().join('\0') ||
    Object.values(volumeTypes).some(
      (types) => !Array.isArray(types) || types.length === 0 || types.some((type) => !type)
    ) ||
    compute?.preemptible !== true ||
    compute?.publicIp !== false ||
    compute?.ingress !== false ||
    policy.imageSelector?.name !== 'Ubuntu 24.04 LTS 64-bit' ||
    policy.lifecycle?.maxProfiles !== 10 ||
    policy.lifecycle?.ttlSeconds !== 10800 ||
    policy.runner?.maxJobs !== 1 ||
    policy.network?.lifecycle !== 'disposable-per-attempt' ||
    typeof policy.network?.securityGroupNamePrefix !== 'string' ||
    policy.network.securityGroupNamePrefix.length === 0 ||
    policy.trust?.persistentNetworkResources !== false ||
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
  const normalized = stableStringify({ profiles: normalizedProfiles });
  return {
    digest: `sha256:${crypto.createHash('sha256').update(normalized).digest('hex')}`,
    profiles: normalizedProfiles,
  };
}

export function validateSelectelProfilesForLane(raw, lane, root = process.cwd()) {
  const validated = validateSelectelQaProfiles(raw, root);
  if (!['proof', 'release'].includes(lane)) throw new Error(`Unknown Selectel lane: ${lane}`);
  const semantics = JSON.parse(
    fs.readFileSync(path.join(root, 'tooling/configs/ci/proof-semantics.json'), 'utf8')
  );
  const minimum = semantics.reuseCompatibility?.[lane]?.minimumExecutionProfile;
  if (!minimum) throw new Error(`Selectel ${lane} minimum execution profile is missing.`);
  for (const [index, profile] of validated.profiles.entries()) {
    const actual = {
      ...profile.qa,
      vitestWorkers: profile.qa.vitestWorkers,
    };
    const below = Object.entries(minimum).filter(([key, value]) => actual[key] < value);
    if (below.length > 0) {
      throw new Error(`Selectel profile ${index} is below the ${lane} lane minimum.`);
    }
  }
  return validated;
}
