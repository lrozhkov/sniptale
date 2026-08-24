import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { stableStringify } from '../../qa/core/proof-input.mjs';

export const SELECTEL_POLICY_PATH = 'tooling/configs/ci/selectel-runner.json';

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function readSelectelPolicy(root = process.cwd()) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, SELECTEL_POLICY_PATH), 'utf8'));
  const compute = policy?.compute;
  if (
    policy?.schemaVersion !== 1 ||
    policy.artifactKind !== 'sniptale-selectel-runner-policy' ||
    policy.environment !== 'selectel-runner-controller' ||
    compute?.operatingSystem !== 'Ubuntu 24.04 LTS' ||
    compute?.architecture !== 'x86_64' ||
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
    for (const [field, value] of [
      ['zone', profile.zone],
      ['flavor', profile.flavor],
      ['volumeType', profile.volumeType],
    ]) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Selectel profile ${index} ${field} is malformed.`);
      }
    }
    if (!isPositiveInteger(profile.volumeGiB))
      throw new Error(`Selectel profile ${index} volume size is malformed.`);
    if (
      ['vitestWorkers', 'playwrightWorkers', 'securityWorkers'].some(
        (worker) => profile.qa[worker] > profile.qa.cpuTokens
      )
    ) {
      throw new Error(`Selectel profile ${index} workers exceed CPU tokens.`);
    }
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
  return validated;
}
