import fs from 'node:fs';
import path from 'node:path';

import { authenticateOpenStack, openStackJson } from './openstack-client.mjs';
import { readSelectelPolicy } from './policy.mjs';
import { isExecutedAsScript } from '../../qa/core/shared.mjs';

function numberField(value, names) {
  for (const name of names) {
    const candidate = value?.[name];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function available(limit, used) {
  return limit < 0 ? Number.POSITIVE_INFINITY : limit - used;
}

function detailedQuotaPair(value, field) {
  if (typeof value?.[field] === 'object' && value[field] !== null) {
    return {
      limit: numberField(value[field], ['limit']),
      used: numberField(value[field], ['in_use']),
    };
  }
  return { limit: null, used: null };
}

function volumeQuotaPair(value) {
  const detailed = detailedQuotaPair(value, 'gigabytes');
  if (detailed.limit !== null || detailed.used !== null) return detailed;
  return {
    limit: numberField(value, ['gigabytes']),
    used: numberField(value, ['gigabytes_used', 'gigabytes_in_use']),
  };
}

function assertQuotaPair(limit, used, label) {
  if (limit === null || used === null || limit < 0 || used < 0 || (limit >= 0 && used > limit)) {
    throw new Error(`OpenStack ${label} quota is missing or invalid.`);
  }
}

function selectFlavor(flavors, policy) {
  const matches = flavors.filter(
    (flavor) => flavor?.vcpus === policy.compute.vcpus && flavor?.ram === policy.compute.ramMiB
  );
  if (matches.length !== 1 || typeof matches[0].id !== 'string') {
    throw new Error('Expected exactly one Selectel flavor for the canonical resource profile.');
  }
  return matches[0];
}

function selectImage(images, policy) {
  const matches = images
    .filter((image) => {
      const architecture = image?.architecture ?? image?.properties?.architecture;
      const osDistro = image?.os_distro ?? image?.properties?.os_distro;
      const osVersion = image?.os_version ?? image?.properties?.os_version;
      return (
        image?.status === 'active' &&
        image?.name === policy.imageSelector.name &&
        osDistro === policy.imageSelector.osDistro &&
        osVersion === policy.imageSelector.osVersion &&
        policy.imageSelector.architectures.includes(architecture)
      );
    })
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  if (matches.length === 0 || typeof matches[0].id !== 'string') {
    throw new Error(`No active ${policy.compute.operatingSystem} amd64 image is available.`);
  }
  return matches[0];
}

function availableZones(zones) {
  return zones
    .filter((zone) => zone?.zoneState?.available === true && typeof zone?.zoneName === 'string')
    .map((zone) => zone.zoneName)
    .sort((left, right) => left.localeCompare(right));
}

function zoneQuotaPair(payload, resource, zone) {
  const entries = payload?.quotas?.[resource];
  if (!Array.isArray(entries)) return { limit: null, used: null };
  const matches = entries.filter((entry) => entry?.zone === zone);
  if (matches.length !== 1) return { limit: null, used: null };
  return {
    limit: numberField(matches[0], ['value']),
    used: numberField(matches[0], ['used']),
  };
}

function selectRunnerCapacity({ quotaManager, volume, zones }, policy) {
  if (quotaManager?.error != null) {
    throw new Error('Selectel quota manager reported a partial failure.');
  }
  const volumes = volume?.quota_set ?? volume;
  const { limit: maxGigabytes, used: usedGigabytes } = volumeQuotaPair(volumes);
  assertQuotaPair(maxGigabytes, usedGigabytes, 'volume capacity');
  if (available(maxGigabytes, usedGigabytes) < policy.compute.bootVolumeGiB) {
    throw new Error('Selectel project has insufficient free canonical runner quota.');
  }
  const candidates = availableZones(zones).flatMap((zone) => {
    const { limit: maxCores, used: usedCores } = zoneQuotaPair(quotaManager, 'compute_cores', zone);
    const { limit: maxRam, used: usedRam } = zoneQuotaPair(quotaManager, 'compute_ram', zone);
    try {
      assertQuotaPair(maxCores, usedCores, 'compute core');
      assertQuotaPair(maxRam, usedRam, 'compute RAM');
    } catch {
      return [];
    }
    if (
      available(maxCores, usedCores) < policy.compute.vcpus ||
      available(maxRam, usedRam) < policy.compute.ramMiB
    ) {
      return [];
    }
    return [{ zone, maxCores, usedCores, maxRam, usedRam }];
  });
  if (candidates.length === 0) {
    throw new Error('No available Selectel zone has complete canonical runner quota.');
  }
  const selected = candidates[0];
  return {
    availabilityZone: selected.zone,
    quotas: {
      freeVcpus: available(selected.maxCores, selected.usedCores),
      freeRamMiB: available(selected.maxRam, selected.usedRam),
      freeVolumeGiB: available(maxGigabytes, usedGigabytes),
    },
  };
}

export async function collectSelectelPreflight({
  root = process.cwd(),
  env,
  fetchImpl,
  policy = readSelectelPolicy(root),
} = {}) {
  const session = await authenticateOpenStack({
    env,
    expectedProjectSha256: policy.controllerEnvironment.expectedProjectSha256,
    expectedRegion: policy.controllerEnvironment.expectedRegion,
    quotaManagerUrl: policy.controllerEnvironment.quotaManagerUrl,
    fetchImpl,
  });
  const request = (service, requestPath, operation) =>
    openStackJson(session, service, requestPath, { fetchImpl, operation });
  const [quotaManager, volumeQuota, flavorPayload, zonePayload, imagePayload, networkPayload] =
    await Promise.all([
      request(
        'quotaManager',
        `/v1/projects/${session.projectId}/quotas?resource=compute_cores&resource=compute_ram`,
        'quota'
      ),
      request('volume', `/os-quota-sets/${session.projectId}?usage=true`, 'quota'),
      request('compute', '/flavors/detail', 'flavors'),
      request('compute', '/os-availability-zone', 'availability zones'),
      request('image', '/v2/images?status=active&limit=200', 'images'),
      request('network', '/v2.0/networks?router%3Aexternal=true', 'external networks'),
    ]);
  const capacity = selectRunnerCapacity(
    { quotaManager, volume: volumeQuota, zones: zonePayload.availabilityZoneInfo ?? [] },
    policy
  );
  const flavor = selectFlavor(flavorPayload.flavors ?? [], policy);
  const image = selectImage(imagePayload.images ?? [], policy);
  const externalNetworks = networkPayload.networks ?? [];
  if (
    externalNetworks.length !== 1 ||
    typeof externalNetworks[0]?.id !== 'string' ||
    externalNetworks[0]?.['router:external'] !== true
  ) {
    throw new Error('Expected exactly one Selectel external network.');
  }
  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-selectel-connectivity-proof',
    project: session.projectFingerprint,
    region: session.region,
    availabilityZone: capacity.availabilityZone,
    image: { id: image.id, name: image.name },
    flavor: { id: flavor.id, name: flavor.name, vcpus: flavor.vcpus, ramMiB: flavor.ram },
    externalNetwork: { id: externalNetworks[0].id, name: externalNetworks[0].name },
    quotas: capacity.quotas,
    requested: {
      vcpus: policy.compute.vcpus,
      ramMiB: policy.compute.ramMiB,
      bootVolumeGiB: policy.compute.bootVolumeGiB,
    },
  };
}

export async function writeSelectelPreflight(options = {}) {
  const proof = await collectSelectelPreflight(options);
  const destination = path.join(
    options.root ?? process.cwd(),
    'build/selectel-controller/preflight.json'
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  return destination;
}

if (isExecutedAsScript(import.meta.url)) {
  writeSelectelPreflight()
    .then((destination) => process.stdout.write(`Selectel connectivity proof: ${destination}\n`))
    .catch((error) => {
      process.stderr.write(
        `Selectel connectivity check failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    });
}
